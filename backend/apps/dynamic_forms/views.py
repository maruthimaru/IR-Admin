"""
Dynamic Form Engine - The Core of the Admin Panel
Handles form configuration, field management, and runtime data operations
"""
import csv
import io
import logging
import datetime
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.http import HttpResponse

from apps.utils.mongodb import get_tenant_db
from apps.core.middleware import get_tenant_db_name

logger = logging.getLogger(__name__)


def _check_form_permission(request, db, form_name: str, action: str) -> bool:
    """
    Returns True if the current user may perform `action` on `form_name`.
    super_admin / company_admin / developer → always True.
    end_user → checks their tenant role's form-level permissions.
    action: 'view' | 'add' | 'edit' | 'delete' | 'export' | 'import'
    """
    from bson import ObjectId as _ObjId
    role = getattr(request.user, 'role', 'end_user')
    if role in ('super_admin', 'company_admin', 'developer'):
        return True

    try:
        from apps.utils.mongodb import get_main_db as _main_db
        user_doc = _main_db()['users'].find_one({'_id': _ObjId(request.user.id)})
    except Exception:
        return False

    tenant_role_id = (user_doc or {}).get('tenant_role_id')
    if not tenant_role_id:
        return False

    try:
        tenant_role = db['roles'].find_one({'_id': _ObjId(tenant_role_id)})
    except Exception:
        return False

    if not tenant_role or not tenant_role.get('is_active', True):
        return False

    perms = tenant_role.get('permissions', {})
    return bool(perms.get('forms', {}).get(form_name, {}).get(action, False))


ALLOWED_FIELD_TYPES = [
    'text', 'number', 'email', 'phone', 'date', 'datetime', 'time',
    'select', 'multi_select', 'checkbox', 'radio', 'textarea',
    'file', 'image', 'currency', 'percentage', 'url', 'color',
    'rating', 'switch', 'hidden', 'formula', 'relation',
    'api_select', 'dependent_select', 'uid', 'sub_form', 'edit_with_new',
]


# ──────────────────────────────────────────────
# FORM CONFIGURATION (Developer Panel)
# ──────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def form_configs(request):
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=status.HTTP_400_BAD_REQUEST)

    db = get_tenant_db(db_name)

    if request.method == 'GET':
        form_type = request.GET.get('type')
        query = {}
        if form_type:
            query['type'] = form_type

        forms = list(db['dynamic_forms'].find(query).sort('created_at', -1))
        for f in forms:
            f['_id'] = str(f['_id'])
            if isinstance(f.get('created_at'), datetime.datetime):
                f['created_at'] = f['created_at'].isoformat()

        return Response({'results': forms, 'total': len(forms)})

    elif request.method == 'POST':
        return _create_form_config(request, db)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def form_config_detail(request, form_name):
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=status.HTTP_400_BAD_REQUEST)

    db = get_tenant_db(db_name)
    form = db['dynamic_forms'].find_one({'form_name': form_name})
    if not form:
        return Response({'error': 'Form not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        form['_id'] = str(form['_id'])
        if isinstance(form.get('created_at'), datetime.datetime):
            form['created_at'] = form['created_at'].isoformat()
        return Response(form)

    elif request.method == 'PUT':
        data = request.data
        update = {'updated_at': datetime.datetime.utcnow()}

        if 'display_name' in data:
            update['display_name'] = data['display_name']
        if 'category' in data:
            update['category'] = data['category']
        if 'layout' in data:
            update['layout'] = data['layout']
        if 'fields' in data:
            validated = _validate_fields(data['fields'])
            if isinstance(validated, Response):
                return validated
            update['fields'] = validated
            # Re-setup indexes
            collection_name = f"records_{form_name}"
            _setup_form_collection(db, collection_name, validated)
        if 'settings' in data:
            update['settings'] = data['settings']

        db['dynamic_forms'].update_one({'form_name': form_name}, {'$set': update})

        # Update the linked list page columns and footer if fields changed
        if 'fields' in data:
            list_page_name = f"{form_name}_list"
            list_page = db['dynamic_forms'].find_one({'form_name': list_page_name, 'type': 'list'})
            if list_page:
                new_cols = [f['key'] for f in update['fields']]
                new_footer = {
                    f['key']: 'sum'
                    for f in update['fields']
                    if f.get('show_footer_sum') and f['type'] in ('number', 'currency')
                }
                db['dynamic_forms'].update_one(
                    {'form_name': list_page_name},
                    {'$set': {
                        'columns': new_cols,
                        'footer': new_footer,
                        'updated_at': datetime.datetime.utcnow(),
                    }}
                )

        return Response({'message': f'Form "{form_name}" updated successfully'})

    elif request.method == 'DELETE':
        # Delete config, linked list page, and data collection
        db['dynamic_forms'].delete_one({'form_name': form_name})
        db['dynamic_forms'].delete_many({'form_ref': form_name, 'type': 'list'})
        collection_name = f"records_{form_name}"
        db[collection_name].drop()
        logger.info(f"Form deleted: {form_name}")
        return Response({'message': f'Form "{form_name}" deleted'})


def _create_form_config(request, db):
    data = request.data
    form_type = data.get('type', 'input')
    if form_type == 'input':
        return _create_input_form(data, db, request.user)
    elif form_type == 'list':
        return _create_list_page(data, db, request.user)
    return Response({'error': f'Invalid form type: {form_type}'}, status=400)


def _create_input_form(data: dict, db, user) -> Response:
    form_name = data.get('form_name', '').strip().lower().replace(' ', '_')
    if not form_name:
        return Response({'error': 'form_name is required'}, status=400)

    if db['dynamic_forms'].find_one({'form_name': form_name}):
        return Response({'error': f'Form "{form_name}" already exists'}, status=409)

    fields = data.get('fields', [])
    validated_fields = _validate_fields(fields)
    if isinstance(validated_fields, Response):
        return validated_fields

    display_name = data.get('display_name', form_name.replace('_', ' ').title())
    now = datetime.datetime.utcnow()

    form_config = {
        'form_name':    form_name,
        'display_name': display_name,
        'category':     data.get('category', ''),
        'type':         'input',
        'fields':       validated_fields,
        'settings': {
            'allow_edit':             data.get('allow_edit', True),
            'allow_delete':           data.get('allow_delete', True),
            'require_confirmation':   data.get('require_confirmation', False),
            'max_records':            data.get('max_records', None),
        },
        'layout':     data.get('layout', 'vertical'),
        'hooks':      {'before_save': None, 'after_save': None},
        'permissions': {'roles': ['all']},
        'created_by': str(user.id),
        'created_at': now,
        'updated_at': now,
        'is_active':  True,
    }

    result = db['dynamic_forms'].insert_one(form_config)
    form_config['_id'] = str(result.inserted_id)

    collection_name = f"records_{form_name}"
    _setup_form_collection(db, collection_name, validated_fields)

    # ── Auto-create paired list page ──────────────────────────────
    list_page_name = f"{form_name}_list"
    if not db['dynamic_forms'].find_one({'form_name': list_page_name}):
        list_config = {
            'form_name':    list_page_name,
            'display_name': f"{display_name} List",
            'type':         'list',
            'form_ref':     form_name,
            'columns':      [f['key'] for f in validated_fields],
            'footer':       {
                f['key']: 'sum'
                for f in validated_fields
                if f.get('show_footer_sum') and f['type'] in ('number', 'currency')
            },
            'actions':      ['edit', 'delete'],
            'filters':      [f['key'] for f in validated_fields if f['type'] in (
                'select', 'radio', 'date', 'boolean', 'switch', 'checkbox'
            )],
            'sorting':    {'field': 'created_at', 'order': 'desc'},
            'pagination': {'enabled': True, 'page_size': 20},
            'search':     {'enabled': True, 'fields': [
                f['key'] for f in validated_fields if f.get('is_searchable')
            ]},
            'export':     {'enabled': True, 'formats': ['csv']},
            'created_by': str(user.id),
            'created_at': now,
            'updated_at': now,
            'is_active':  True,
        }
        db['dynamic_forms'].insert_one(list_config)

    logger.info(f"Input form created: {form_name}")
    return Response({
        'message':    f'Form "{form_name}" created successfully',
        'form':       form_config,
        'collection': collection_name,
        'list_page':  list_page_name,
    }, status=201)


def _create_list_page(data: dict, db, user) -> Response:
    form_ref = data.get('form_ref', '').strip()
    if not form_ref:
        return Response({'error': 'form_ref is required for list pages'}, status=400)

    source_form = db['dynamic_forms'].find_one({'form_name': form_ref, 'type': 'input'})
    if not source_form:
        return Response({'error': f'Source form "{form_ref}" not found'}, status=404)

    page_name = data.get('page_name', f'{form_ref}_list')
    if db['dynamic_forms'].find_one({'form_name': page_name, 'type': 'list'}):
        return Response({'error': f'List page "{page_name}" already exists'}, status=409)

    footer = data.get('footer', {})
    for col, agg in footer.items():
        if agg not in ('sum', 'avg', 'min', 'max', 'count'):
            return Response({'error': f'Invalid aggregation "{agg}" for "{col}"'}, status=400)

    now = datetime.datetime.utcnow()
    list_config = {
        'form_name':    page_name,
        'display_name': data.get('display_name', page_name.replace('_', ' ').title()),
        'type':         'list',
        'form_ref':     form_ref,
        'columns':      data.get('columns', [f['key'] for f in source_form.get('fields', [])]),
        'footer':       footer,
        'actions':      data.get('actions', ['edit', 'delete']),
        'filters':      data.get('filters', []),
        'sorting':      data.get('sorting', {'field': 'created_at', 'order': 'desc'}),
        'pagination':   data.get('pagination', {'enabled': True, 'page_size': 20}),
        'search':       data.get('search', {'enabled': True, 'fields': []}),
        'export':       {'enabled': True, 'formats': ['csv']},
        'created_by': str(user.id),
        'created_at': now,
        'updated_at': now,
        'is_active':  True,
    }

    result = db['dynamic_forms'].insert_one(list_config)
    list_config['_id'] = str(result.inserted_id)
    logger.info(f"List page created: {page_name}")
    return Response({'message': f'List page "{page_name}" created', 'page': list_config}, status=201)


def _validate_fields(fields: list):
    if not fields:
        return Response({'error': 'At least one field is required'}, status=400)

    validated, keys_seen = [], set()
    for i, field in enumerate(fields):
        label      = field.get('label', '').strip()
        key        = field.get('key', label.lower().replace(' ', '_')).strip()
        field_type = field.get('type', 'text')

        if not label:
            return Response({'error': f'Field {i+1}: label is required'}, status=400)
        if field_type not in ALLOWED_FIELD_TYPES:
            return Response({'error': f'Invalid type "{field_type}"'}, status=400)
        if key in keys_seen:
            return Response({'error': f'Duplicate field key: "{key}"'}, status=400)
        keys_seen.add(key)

        validated.append({
            'label':          label,
            'key':            key,
            'type':           field_type,
            'required':       field.get('required', False),
            'placeholder':    field.get('placeholder', ''),
            'default_value':  field.get('default_value', None),
            'options':        field.get('options', []),
            'validation': {
                'min':            field.get('min', None),
                'max':            field.get('max', None),
                'min_length':     field.get('min_length', None),
                'max_length':     field.get('max_length', None),
                'pattern':        field.get('pattern', None),
                'custom_message': field.get('validation_message', None),
            },
            'order':          field.get('order', i),
            'width':          field.get('width', 'full'),
            'help_text':      field.get('help_text', ''),
            'is_searchable':   field.get('is_searchable', False),
            'is_sortable':     field.get('is_sortable', False),
            'show_footer_sum': field.get('show_footer_sum', False),
            'hidden':          field.get('hidden', False),
            # API-driven select config
            'api_url':           field.get('api_url', ''),
            'api_method':        field.get('api_method', 'GET'),
            'response_path':     field.get('response_path', 'data'),
            'display_key':       field.get('display_key', 'name'),
            'value_key':         field.get('value_key', 'id'),
            # Auth
            'api_auth_type':     field.get('api_auth_type', 'none'),
            'api_auth_token':    field.get('api_auth_token', ''),
            'api_auth_username': field.get('api_auth_username', ''),
            'api_auth_password': field.get('api_auth_password', ''),
            # POST body
            'api_body':          field.get('api_body', ''),
            # Dependent select config
            'depends_on':        field.get('depends_on', ''),
            'filter_key':        field.get('filter_key', ''),
            # Searchable combobox & value source (number/currency)
            'searchable_dropdown': field.get('searchable_dropdown', False),
            # api_select / dependent_select data source
            'api_source':  field.get('api_source', 'url'),
            'source_form': field.get('source_form', ''),
            'value_source':        field.get('value_source', 'manual'),
            'formula':             field.get('formula', ''),
            # Uniqueness constraint
            'is_unique':           field.get('is_unique', False),
            # API select — label key stored for list display
            'table_value_key':     field.get('table_value_key', ''),
            # Date/datetime/time display format, per-field timezone & default
            'date_format':         field.get('date_format', 'DD/MM/YYYY'),
            'time_format':         field.get('time_format', '24h'),
            'field_timezone':      field.get('field_timezone', ''),
            'default_now':         field.get('default_now', False),
            # Inline edit in list view
            'edit_on_list':        field.get('edit_on_list', False),
            # Combined text field template
            'combined_template':   field.get('combined_template', ''),
            # Sub-form fields (nested field definitions)
            'sub_form_fields':     field.get('sub_form_fields', []),
            # Field lookup (auto-populate text field from a form-source dropdown)
            'lookup_field_key':    field.get('lookup_field_key', ''),
            'lookup_source_field': field.get('lookup_source_field', ''),
            # Sum sub-form column into parent field
            'sum_to_main':         field.get('sum_to_main', False),
            # Conditional formula (value_source = 'conditional')
            'condition_field':             field.get('condition_field', ''),
            'conditions':                  field.get('conditions', []),
            'condition_default_formula':   field.get('condition_default_formula', ''),
            # Sub-form record update on save (multiple targets)
            'update_enabled':  field.get('update_enabled', False),
            'update_targets':  field.get('update_targets', []),
            # Edit-with-new field config
            'reference_key':   field.get('reference_key', ''),
            'update_on_save':  field.get('update_on_save', False),
            'ewn_update_rules': field.get('ewn_update_rules', []),
            # Currency display symbol
            'currency_symbol': field.get('currency_symbol', ''),
            # Extra filter params for api_select / dependent_select
            'api_filters': field.get('api_filters', []),
        })
    return validated


def _setup_form_collection(db, collection_name: str, fields: list):
    collection = db[collection_name]
    collection.create_index([('created_at', -1)])

    # Fields that currently want a unique constraint
    unique_keys = {f['key'] for f in fields if f.get('is_unique') and f.get('type') != 'uid'}

    # Drop any existing unique indexes whose field is no longer marked is_unique
    try:
        for idx_name, idx_info in collection.index_information().items():
            if idx_name == '_id_' or not idx_info.get('unique', False):
                continue
            idx_fields = [k for k, _ in idx_info.get('key', [])]
            if any(k not in unique_keys for k in idx_fields):
                collection.drop_index(idx_name)
    except Exception:
        pass

    for field in fields:
        if field.get('is_unique') and field.get('type') != 'uid':
            collection.create_index(field['key'], unique=True, sparse=True)
        elif field.get('is_searchable') or field.get('is_sortable'):
            collection.create_index(field['key'])


def _extract_duplicate_field(exc: DuplicateKeyError, fields: list) -> str:
    """Try to extract a human-readable field key from a DuplicateKeyError message."""
    import re
    msg = str(exc)
    # pymongo error message contains the index key, e.g. 'index: email_1'
    match = re.search(r'index:\s*\S*?(\w+)_\d+', msg)
    if match:
        candidate = match.group(1)
        for f in fields:
            if f['key'] == candidate:
                return candidate
    return 'value'


def _get_next_uid(db, collection_name: str, field_key: str) -> int:
    """Return the next auto-increment integer UID for the given field."""
    last = db[collection_name].find_one(
        {field_key: {'$exists': True}},
        sort=[(field_key, -1)],
    )
    if last and isinstance(last.get(field_key), (int, float)):
        return int(last[field_key]) + 1
    return 1


def _get_next_subform_uid(db, collection_name: str, sub_form_key: str, uid_field_key: str, batch_vals: list) -> int:
    """Return next auto-increment integer for a uid field inside sub-form rows."""
    max_val = 0
    pipeline = [
        {'$project': {sub_form_key: 1}},
        {'$unwind': {'path': f'${sub_form_key}', 'preserveNullAndEmptyArrays': False}},
        {'$group': {'_id': None, 'mx': {'$max': f'${sub_form_key}.{uid_field_key}'}}},
    ]
    try:
        for doc in db[collection_name].aggregate(pipeline):
            v = doc.get('mx')
            if isinstance(v, (int, float)):
                max_val = max(max_val, int(v))
    except Exception:
        pass
    for v in batch_vals:
        if isinstance(v, int):
            max_val = max(max_val, v)
    return max_val + 1


def _process_subform_rows(db, collection_name: str, sub_form_key: str, rows, sub_fields: list) -> list:
    """Process sub-form row array: auto-generate uid fields, resolve combined {{auto_generate}}."""
    if not isinstance(rows, list):
        return []
    processed = []
    batch_uids: dict = {}  # tracks already-assigned values per field key in this batch

    for row in rows:
        row = dict(row) if isinstance(row, dict) else {}
        for sf in sub_fields:
            sf_key   = sf.get('key', '')
            sf_type  = sf.get('type', '')
            if not sf_key:
                continue

            if sf_type == 'uid':
                # Only generate if not already set (preserves existing UIDs on edit)
                if not row.get(sf_key) and row.get(sf_key) != 0:
                    vals = batch_uids.get(sf_key, [])
                    val  = _get_next_subform_uid(db, collection_name, sub_form_key, sf_key, vals)
                    row[sf_key] = val
                    batch_uids.setdefault(sf_key, []).append(val)

            elif sf_type == 'text' and sf.get('value_source') == 'combined':
                raw = str(row.get(sf_key, '') or '')
                if '{{auto_generate}}' in raw:
                    counter_key = f'_comb_{sf_key}'
                    vals = batch_uids.get(counter_key, [])
                    val  = _get_next_subform_uid(db, collection_name, sub_form_key, sf_key, vals)
                    row[sf_key] = raw.replace('{{auto_generate}}', str(val))
                    batch_uids.setdefault(counter_key, []).append(val)

        processed.append(row)
    return processed


def _apply_subform_updates(db, record_data: dict, fields: list):
    """
    After saving a record, check each sub_form field for update_enabled.
    Iterates over update_targets — each target has its own target_form,
    lookup_key, and rules. Applies field updates (set/increment/decrement/multiply).
    """
    for field in fields:
        if field.get('type') != 'sub_form':
            continue
        if not field.get('update_enabled'):
            continue

        rows = record_data.get(field['key'], [])
        if not isinstance(rows, list):
            continue

        for target in field.get('update_targets', []):
            target_form = (target.get('target_form') or '').strip()
            lookup_key  = (target.get('lookup_key') or '').strip()
            rules       = target.get('rules', [])

            if not target_form or not lookup_key or not rules:
                continue

            target_collection = f'records_{target_form}'

            for row in rows:
                if not isinstance(row, dict):
                    continue

                lookup_value = row.get(lookup_key)
                if lookup_value is None:
                    continue

                # Build MongoDB query — try ObjectId, then int coercion, then plain string
                query = None
                try:
                    query = {'_id': ObjectId(str(lookup_value))}
                except Exception:
                    # Try numeric coercion (uid fields are stored as int)
                    try:
                        query = {lookup_key: int(lookup_value)}
                    except (ValueError, TypeError):
                        query = {lookup_key: lookup_value}

                # Build MongoDB update operators
                set_ops  = {}
                inc_ops  = {}
                mul_ops  = {}

                for rule in rules:
                    to_key     = rule.get('to_key', '')
                    operation  = rule.get('operation', 'set')
                    value_type = rule.get('value_type', 'field')

                    if not to_key:
                        continue

                    # ── Resolve the value to write ────────────────────
                    raw_value = None

                    if value_type == 'static':
                        # Use sentinel None to skip rules with no static_value configured
                        sv = rule.get('static_value')
                        if sv is None:
                            continue
                        raw_value = sv

                    elif value_type == 'conditional':
                        cond_field = rule.get('condition_field', '')
                        if not cond_field:
                            continue
                        cond_value = str(row.get(cond_field, '')).strip().lower()
                        # Case-insensitive match against condition map
                        matched = next(
                            (c.get('value') for c in (rule.get('condition_map') or [])
                             if str(c.get('when', '')).strip().lower() == cond_value),
                            rule.get('default_value', None)
                        )
                        raw_value = matched

                    else:  # 'field' (default)
                        from_key = rule.get('from_key', '')
                        if not from_key:
                            continue
                        raw_value = row.get(from_key)

                    if raw_value is None:
                        continue

                    # ── Apply operation ───────────────────────────────
                    if operation == 'set':
                        set_ops[to_key] = raw_value
                    elif operation == 'increment':
                        try:
                            inc_ops[to_key] = float(raw_value)
                        except (ValueError, TypeError):
                            pass
                    elif operation == 'decrement':
                        try:
                            inc_ops[to_key] = -float(raw_value)
                        except (ValueError, TypeError):
                            pass
                    elif operation == 'multiply':
                        try:
                            mul_ops[to_key] = float(raw_value)
                        except (ValueError, TypeError):
                            pass

                update_doc = {}
                if set_ops:
                    update_doc['$set'] = set_ops
                if inc_ops:
                    update_doc['$inc'] = inc_ops
                if mul_ops:
                    update_doc['$mul'] = mul_ops

                if update_doc:
                    try:
                        db[target_collection].update_one(query, update_doc)
                    except Exception as e:
                        import logging
                        logging.getLogger(__name__).warning(
                            f"Sub-form update failed for {target_collection} lookup={lookup_value}: {e}"
                        )


def _apply_subform_delete_updates(db, old_record: dict, new_record_data: dict, fields: list):
    """
    Detect sub-form rows that were deleted in an update and apply delete_rules
    to their referenced records.
    """
    for field in fields:
        if field.get('type') != 'sub_form':
            continue
        if not field.get('update_enabled'):
            continue

        field_key = field['key']
        # Only process sub-form fields that were actually sent in the update
        if field_key not in new_record_data:
            continue

        old_rows = old_record.get(field_key, [])
        new_rows = new_record_data.get(field_key, [])
        if not isinstance(old_rows, list):
            old_rows = []
        if not isinstance(new_rows, list):
            new_rows = []

        for target in field.get('update_targets', []):
            target_form  = (target.get('target_form') or '').strip()
            lookup_key   = (target.get('lookup_key') or '').strip()
            delete_rules = target.get('delete_rules') or []

            if not target_form or not lookup_key or not delete_rules:
                continue

            target_collection = f'records_{target_form}'

            # Build set of lookup values that still exist in new rows
            new_lookup_values = set()
            for row in new_rows:
                if isinstance(row, dict):
                    v = row.get(lookup_key)
                    if v is not None:
                        new_lookup_values.add(str(v))

            # Apply delete_rules for each row missing from the new list
            for row in old_rows:
                if not isinstance(row, dict):
                    continue
                lookup_value = row.get(lookup_key)
                if lookup_value is None:
                    continue
                if str(lookup_value) in new_lookup_values:
                    continue

                # Build MongoDB query — try ObjectId, then int coercion, then plain string
                query = None
                try:
                    query = {'_id': ObjectId(str(lookup_value))}
                except Exception:
                    try:
                        query = {lookup_key: int(lookup_value)}
                    except (ValueError, TypeError):
                        query = {lookup_key: lookup_value}

                set_ops, inc_ops, mul_ops = {}, {}, {}

                for rule in delete_rules:
                    to_key     = rule.get('to_key', '')
                    operation  = rule.get('operation', 'set')
                    value_type = rule.get('value_type', 'static')

                    if not to_key:
                        continue

                    raw_value = None
                    if value_type == 'static':
                        sv = rule.get('static_value')
                        if sv is None:
                            continue
                        raw_value = sv
                    elif value_type == 'conditional':
                        cond_field = rule.get('condition_field', '')
                        if not cond_field:
                            continue
                        cond_value = str(row.get(cond_field, '')).strip().lower()
                        matched = next(
                            (c.get('value') for c in (rule.get('condition_map') or [])
                             if str(c.get('when', '')).strip().lower() == cond_value),
                            rule.get('default_value', None)
                        )
                        raw_value = matched
                    else:  # 'field'
                        from_key = rule.get('from_key', '')
                        if not from_key:
                            continue
                        raw_value = row.get(from_key)

                    if raw_value is None:
                        continue

                    if operation == 'set':
                        set_ops[to_key] = raw_value
                    elif operation == 'increment':
                        try:
                            inc_ops[to_key] = float(raw_value)
                        except (ValueError, TypeError):
                            pass
                    elif operation == 'decrement':
                        try:
                            inc_ops[to_key] = -float(raw_value)
                        except (ValueError, TypeError):
                            pass
                    elif operation == 'multiply':
                        try:
                            mul_ops[to_key] = float(raw_value)
                        except (ValueError, TypeError):
                            pass

                update_doc = {}
                if set_ops:
                    update_doc['$set'] = set_ops
                if inc_ops:
                    update_doc['$inc'] = inc_ops
                if mul_ops:
                    update_doc['$mul'] = mul_ops

                if update_doc:
                    try:
                        db[target_collection].update_one(query, update_doc)
                    except Exception as e:
                        import logging
                        logging.getLogger(__name__).warning(
                            f"Sub-form delete update failed for {target_collection} lookup={lookup_value}: {e}"
                        )


def _apply_ewn_subform_delete_updates(db, collection_name: str, validated_data: dict, fields: list):
    """
    For edit_with_new records: compare new sub-form rows against the original
    referenced record and apply delete_rules for any rows that were removed.
    """
    ewn_field = next((f for f in fields if f.get('type') == 'edit_with_new'), None)
    if not ewn_field:
        return

    reference_key = (ewn_field.get('reference_key') or '').strip()
    if not reference_key:
        return

    ref_value = validated_data.get(ewn_field['key'])
    if ref_value is None:
        return

    # Try numeric coercions to find the referenced old record
    candidates = [ref_value]
    try:
        candidates.append(int(ref_value))
    except (ValueError, TypeError):
        pass
    try:
        v = float(ref_value)
        if v not in candidates:
            candidates.append(v)
    except (ValueError, TypeError):
        pass

    old_record = None
    for candidate in candidates:
        old_record = db[collection_name].find_one(
            {reference_key: candidate, 'is_deleted': {'$ne': True}}
        )
        if old_record:
            break

    if not old_record:
        return

    _apply_subform_delete_updates(db, old_record, validated_data, fields)


# ──────────────────────────────────────────────
# RUNTIME DATA API
# ──────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def form_records(request, form_name):
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=400)

    db = get_tenant_db(db_name)
    form_config = db['dynamic_forms'].find_one({'form_name': form_name, 'type': 'input'})
    if not form_config:
        return Response({'error': f'Form "{form_name}" not found'}, status=404)

    collection_name = f"records_{form_name}"
    if request.method == 'GET':
        if not _check_form_permission(request, db, form_name, 'view'):
            return Response({'error': 'Access denied: view permission required'}, status=403)
        return _list_records(request, db, collection_name, form_config)
    if not _check_form_permission(request, db, form_name, 'add'):
        return Response({'error': 'Access denied: add permission required'}, status=403)
    return _create_record(request, db, collection_name, form_config)


def _list_records(request, db, collection_name, form_config):
    page      = int(request.GET.get('page', 1))
    page_size = int(request.GET.get('page_size', 20))
    search    = request.GET.get('search', '')
    sort_by   = request.GET.get('sort_by', 'created_at')
    sort_order = -1 if request.GET.get('sort_order', 'desc') == 'desc' else 1

    query = {'is_deleted': {'$ne': True}}
    if search:
        searchable = [f['key'] for f in form_config.get('fields', []) if f.get('is_searchable')]
        if searchable:
            query['$or'] = [{field: {'$regex': search, '$options': 'i'}} for field in searchable]

    # Per-field filters from query params
    for field in form_config.get('fields', []):
        key   = field['key']
        ftype = field.get('type', 'text')
        val   = request.GET.get(f'filter_{key}')
        if val:
            if ftype in ('number', 'currency', 'percentage', 'uid'):
                try:
                    query[key] = int(val) if '.' not in val else float(val)
                except (ValueError, TypeError):
                    query[key] = val
            else:
                query[key] = val
        # Date / datetime / time range filters
        if ftype in ('date', 'datetime', 'time'):
            gte = request.GET.get(f'filter_{key}_gte')
            lte = request.GET.get(f'filter_{key}_lte')
            if gte or lte:
                query[key] = {}
                if gte:
                    query[key]['$gte'] = gte
                if lte:
                    query[key]['$lte'] = lte

    total   = db[collection_name].count_documents(query)
    records = list(db[collection_name].find(query)
                   .sort(sort_by, sort_order)
                   .skip((page - 1) * page_size)
                   .limit(page_size))
    for r in records:
        r['_id'] = str(r['_id'])
        for k, v in r.items():
            if isinstance(v, datetime.datetime):
                r[k] = v.isoformat()

    return Response({'results': records, 'total': total, 'page': page, 'page_size': page_size})


def _create_record(request, db, collection_name, form_config):
    fields, errors, validated_data = form_config.get('fields', []), {}, {}
    for field in fields:
        key        = field['key']
        field_type = field['type']

        # ── UID: auto-generate, skip user input entirely ──────────
        if field_type == 'uid':
            validated_data[key] = _get_next_uid(db, collection_name, key)
            continue

        value = request.data.get(key)
        if field.get('required') and (value is None or value == ''):
            errors[key] = f"{field['label']} is required"
            continue
        if value is None:
            continue
        try:
            validated_data[key] = _validate_field_value(value, field)
        except ValueError as e:
            errors[key] = str(e)
            continue

        # ── Combined text field: resolve {{auto_generate}} token ──
        if field_type == 'text' and field.get('value_source') == 'combined':
            raw = str(validated_data.get(key, '') or '')
            if '{{auto_generate}}' in raw:
                next_num = _get_next_uid(db, collection_name, key)
                validated_data[key] = raw.replace('{{auto_generate}}', str(next_num))

        # ── Uniqueness check ──────────────────────────────────────
        if field.get('is_unique') and validated_data.get(key) not in (None, ''):
            existing = db[collection_name].find_one({key: validated_data[key]})
            if existing:
                errors[key] = f"{field['label']}: this value already exists"

    if errors:
        return Response({'errors': errors}, status=400)

    # Process sub-form rows: uid auto-generation, combined text {{auto_generate}}
    for field in fields:
        if field['type'] == 'sub_form':
            key = field['key']
            sub_fields = field.get('sub_form_fields', [])
            if sub_fields and key in validated_data:
                validated_data[key] = _process_subform_rows(
                    db, collection_name, key, validated_data[key], sub_fields
                )

    # Persist table_value_key labels (display labels for api_select / dependent_select).
    # Stored under "{field_key}_{table_value_key}" to avoid collisions when multiple
    # fields share the same table_value_key name (e.g. all three using "name").
    for field in fields:
        tvk = field.get('table_value_key', '')
        if tvk and field.get('type') in ('api_select', 'dependent_select'):
            storage_key = f"{field['key']}_{tvk}"
            label_val = request.data.get(storage_key)
            if label_val is not None:
                validated_data[storage_key] = str(label_val)

    now = datetime.datetime.utcnow()
    validated_data.update({'created_by': str(request.user.id), 'created_at': now, 'updated_at': now, 'is_deleted': False})
    try:
        result = db[collection_name].insert_one(validated_data)
    except DuplicateKeyError as exc:
        field_name = _extract_duplicate_field(exc, fields)
        return Response(
            {'errors': {field_name: f'{field_name}: this value already exists'}},
            status=400,
        )
    validated_data['_id'] = str(result.inserted_id)

    # Apply sub-form record updates (e.g. deduct inventory stock)
    _apply_subform_updates(db, validated_data, fields)

    # Apply edit-with-new update rules to the referenced old record
    _apply_edit_with_new_updates(db, collection_name, validated_data, fields)

    # Apply delete rules for sub-form rows removed during edit_with_new
    _apply_ewn_subform_delete_updates(db, collection_name, validated_data, fields)

    db['audit_logs'].insert_one({
        'action': 'create_record', 'collection': collection_name,
        'record_id': str(result.inserted_id), 'user_id': str(request.user.id), 'created_at': now,
    })
    return Response({'message': 'Record created successfully', 'record': validated_data}, status=201)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def record_detail(request, form_name, record_id):
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=400)

    db = get_tenant_db(db_name)
    collection_name = f"records_{form_name}"

    try:
        record = db[collection_name].find_one({'_id': ObjectId(record_id)})
    except Exception:
        # Not a valid ObjectId — try matching any field that stores this plain string value
        record = db[collection_name].find_one({'_id': record_id})

    if not record:
        return Response({'error': 'Record not found'}, status=404)

    record['_id'] = str(record['_id'])
    for k, v in record.items():
        if isinstance(v, datetime.datetime):
            record[k] = v.isoformat()

    if request.method == 'GET':
        if not _check_form_permission(request, db, form_name, 'view'):
            return Response({'error': 'Access denied: view permission required'}, status=403)
        return Response(record)

    elif request.method == 'PUT':
        if not _check_form_permission(request, db, form_name, 'edit'):
            return Response({'error': 'Access denied: edit permission required'}, status=403)
        form_config = db['dynamic_forms'].find_one({'form_name': form_name})
        fields = form_config.get('fields', []) if form_config else []
        update_data, errors = {}, {}

        for field in fields:
            key        = field['key']
            field_type = field['type']

            # UID fields are immutable — never update them
            if field_type == 'uid':
                continue

            if key not in request.data:
                continue

            try:
                update_data[key] = _validate_field_value(request.data[key], field)
            except ValueError as e:
                errors[key] = str(e)
                continue

            # Uniqueness check — exclude the record being edited
            if field.get('is_unique') and update_data.get(key) not in (None, ''):
                existing = db[collection_name].find_one({
                    key: update_data[key],
                    '_id': {'$ne': ObjectId(record_id)},
                })
                if existing:
                    errors[key] = f"{field['label']}: this value already exists"

        if errors:
            return Response({'errors': errors}, status=400)

        # Process sub-form rows: uid auto-generation, combined text {{auto_generate}}
        for field in fields:
            if field['type'] == 'sub_form':
                key = field['key']
                sub_fields = field.get('sub_form_fields', [])
                if sub_fields and key in update_data:
                    update_data[key] = _process_subform_rows(
                        db, collection_name, key, update_data[key], sub_fields
                    )

        # Persist table_value_key labels (display labels for api_select / dependent_select).
        # Stored under "{field_key}_{table_value_key}" to avoid collisions.
        for field in fields:
            tvk = field.get('table_value_key', '')
            if tvk and field.get('type') in ('api_select', 'dependent_select'):
                storage_key = f"{field['key']}_{tvk}"
                if storage_key in request.data:
                    update_data[storage_key] = str(request.data[storage_key])

        now = datetime.datetime.utcnow()
        update_data.update({'updated_at': now, 'updated_by': str(request.user.id)})
        try:
            db[collection_name].update_one({'_id': ObjectId(record_id)}, {'$set': update_data})
        except DuplicateKeyError as exc:
            field_name = _extract_duplicate_field(exc, fields)
            return Response(
                {'errors': {field_name: f'{field_name}: this value already exists'}},
                status=400,
            )
        # Apply sub-form record updates (e.g. deduct inventory stock)
        _apply_subform_updates(db, update_data, fields)

        # Apply delete rules for sub-form rows that were removed
        _apply_subform_delete_updates(db, record, update_data, fields)

        db['audit_logs'].insert_one({
            'action': 'update_record', 'collection': collection_name,
            'record_id': record_id, 'user_id': str(request.user.id), 'created_at': now,
        })
        return Response({'message': 'Record updated successfully'})

    elif request.method == 'DELETE':
        if not _check_form_permission(request, db, form_name, 'delete'):
            return Response({'error': 'Access denied: delete permission required'}, status=403)
        now = datetime.datetime.utcnow()
        db[collection_name].update_one(
            {'_id': ObjectId(record_id)},
            {'$set': {'is_deleted': True, 'updated_at': now, 'deleted_by': str(request.user.id)}}
        )

        # Apply delete rules for all sub-form rows (record deleted = all rows gone)
        form_config_del = db['dynamic_forms'].find_one({'form_name': form_name})
        if form_config_del:
            fields_del = form_config_del.get('fields', [])
            empty_subforms = {
                f['key']: []
                for f in fields_del
                if f.get('type') == 'sub_form' and f.get('update_enabled')
            }
            if empty_subforms:
                _apply_subform_delete_updates(db, record, empty_subforms, fields_del)

        db['audit_logs'].insert_one({
            'action': 'delete_record', 'collection': collection_name,
            'record_id': record_id, 'user_id': str(request.user.id),
            'created_at': now,
        })
        return Response({'message': 'Record deleted successfully'})


# ──────────────────────────────────────────────
# EXPORT — GET /forms/records/<form_name>/export/
# ──────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_records(request, form_name):
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=400)

    db = get_tenant_db(db_name)
    form_config = db['dynamic_forms'].find_one({'form_name': form_name, 'type': 'input'})
    if not form_config:
        return Response({'error': 'Form not found'}, status=404)

    if not _check_form_permission(request, db, form_name, 'export'):
        return Response({'error': 'Access denied: export permission required'}, status=403)

    fields          = form_config.get('fields', [])
    field_keys      = [f['key'] for f in fields]
    field_labels    = [f['label'] for f in fields]
    collection_name = f"records_{form_name}"

    records = list(db[collection_name].find({'is_deleted': {'$ne': True}}).sort('created_at', -1))

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(field_labels)   # header row uses human labels

    for r in records:
        row = []
        for key in field_keys:
            val = r.get(key, '')
            if isinstance(val, datetime.datetime):
                val = val.isoformat()
            row.append(val)
        writer.writerow(row)

    response = HttpResponse(output.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{form_name}.csv"'
    return response


# ──────────────────────────────────────────────
# BULK IMPORT — POST /forms/records/<form_name>/import/
# ──────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def import_records(request, form_name):
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=400)

    db = get_tenant_db(db_name)
    form_config = db['dynamic_forms'].find_one({'form_name': form_name, 'type': 'input'})
    if not form_config:
        return Response({'error': 'Form not found'}, status=404)

    if not _check_form_permission(request, db, form_name, 'import'):
        return Response({'error': 'Access denied: import permission required'}, status=403)

    csv_file = request.FILES.get('file')
    if not csv_file:
        return Response({'error': 'CSV file is required (field: file)'}, status=400)

    fields      = form_config.get('fields', [])
    label_to_key = {f['label'].lower(): f['key'] for f in fields}
    key_to_field  = {f['key']: f for f in fields}

    try:
        content = csv_file.read().decode('utf-8-sig')
        reader  = csv.DictReader(io.StringIO(content))
    except Exception as e:
        return Response({'error': f'Could not parse CSV: {e}'}, status=400)

    collection_name = f"records_{form_name}"
    inserted, row_errors = 0, []
    now = datetime.datetime.utcnow()

    for row_num, row in enumerate(reader, start=2):
        record, errors = {}, {}

        for csv_col, value in row.items():
            # Match CSV header to field key (try exact key first, then label)
            col_lower = csv_col.strip().lower()
            field_key = col_lower if col_lower in key_to_field else label_to_key.get(col_lower)
            if not field_key:
                continue

            field = key_to_field[field_key]
            if value is None or value.strip() == '':
                if field.get('required'):
                    errors[field_key] = f"{field['label']} is required"
                continue
            try:
                record[field_key] = _validate_field_value(value.strip(), field)
            except ValueError as e:
                errors[field_key] = str(e)

        if errors:
            row_errors.append({'row': row_num, 'errors': errors})
            continue

        record.update({'created_by': str(request.user.id), 'created_at': now, 'updated_at': now, 'is_deleted': False})
        db[collection_name].insert_one(record)
        inserted += 1

    return Response({
        'message':    f'{inserted} records imported successfully',
        'inserted':   inserted,
        'row_errors': row_errors,
    }, status=201 if inserted > 0 else 400)


# ──────────────────────────────────────────────
# BULK UPDATE — PATCH /forms/records/<form_name>/bulk-update/
# ──────────────────────────────────────────────

@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def bulk_update_records(request, form_name):
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=400)

    db = get_tenant_db(db_name)
    form_config = db['dynamic_forms'].find_one({'form_name': form_name, 'type': 'input'})
    if not form_config:
        return Response({'error': 'Form not found'}, status=404)

    record_ids = request.data.get('record_ids', [])
    updates    = request.data.get('updates', {})

    if not record_ids:
        return Response({'error': 'record_ids is required'}, status=400)
    if not updates:
        return Response({'error': 'updates is required'}, status=400)

    fields        = form_config.get('fields', [])
    key_to_field  = {f['key']: f for f in fields}
    validated, errors = {}, {}

    for key, value in updates.items():
        if key not in key_to_field:
            continue
        try:
            validated[key] = _validate_field_value(value, key_to_field[key])
        except ValueError as e:
            errors[key] = str(e)

    if errors:
        return Response({'errors': errors}, status=400)

    now = datetime.datetime.utcnow()
    validated.update({'updated_at': now, 'updated_by': str(request.user.id)})

    object_ids = []
    for rid in record_ids:
        try:
            object_ids.append(ObjectId(rid))
        except Exception:
            pass

    result = db[f"records_{form_name}"].update_many(
        {'_id': {'$in': object_ids}},
        {'$set': validated}
    )

    return Response({
        'message':  f'{result.modified_count} records updated',
        'modified': result.modified_count,
    })


# ──────────────────────────────────────────────
# BULK DELETE — DELETE /forms/records/<form_name>/bulk-delete/
# ──────────────────────────────────────────────

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def bulk_delete_records(request, form_name):
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=400)

    db = get_tenant_db(db_name)
    record_ids = request.data.get('record_ids', [])
    if not record_ids:
        return Response({'error': 'record_ids is required'}, status=400)

    object_ids = []
    for rid in record_ids:
        try:
            object_ids.append(ObjectId(rid))
        except Exception:
            pass

    now = datetime.datetime.utcnow()
    result = db[f"records_{form_name}"].update_many(
        {'_id': {'$in': object_ids}},
        {'$set': {'is_deleted': True, 'updated_at': now, 'deleted_by': str(request.user.id)}}
    )
    return Response({'message': f'{result.modified_count} records deleted', 'deleted': result.modified_count})


# ──────────────────────────────────────────────
# LIST PAGE DATA
# ──────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_page_data(request, page_name):
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=400)

    db = get_tenant_db(db_name)
    page_config = db['dynamic_forms'].find_one({'form_name': page_name, 'type': 'list'})
    if not page_config:
        return Response({'error': 'List page not found'}, status=404)

    form_ref        = page_config.get('form_ref')
    collection_name = f"records_{form_ref}"
    columns         = page_config.get('columns', [])

    page      = int(request.GET.get('page', 1))
    page_size = int(request.GET.get('page_size', page_config.get('pagination', {}).get('page_size', 20)))
    search    = request.GET.get('search', '')
    sort_by   = request.GET.get('sort_by', 'created_at')
    sort_order = -1 if request.GET.get('sort_order', 'desc') == 'desc' else 1

    # Load source form ONCE — used for search, filters, and footer
    source_form_doc  = db['dynamic_forms'].find_one({'form_name': form_ref, 'type': 'input'}) or {}
    source_fields    = source_form_doc.get('fields', [])
    source_field_map = {f['key']: f for f in source_fields}

    # Derive footer dynamically from fields that have show_footer_sum enabled
    footer = {
        f['key']: 'sum'
        for f in source_fields
        if f.get('show_footer_sum') and f.get('type') in ('number', 'currency')
    }

    # Build query
    query = {'is_deleted': {'$ne': True}}

    if search:
        searchable = [f['key'] for f in source_fields if f.get('is_searchable')]
        if searchable:
            query['$or'] = [{field: {'$regex': search, '$options': 'i'}} for field in searchable]

    # Per-column filters from query params
    for col in columns:
        field_meta = source_field_map.get(col, {})
        ftype      = field_meta.get('type', 'text')

        val = request.GET.get(f'filter_{col}')
        if val:
            if ftype in ('number', 'currency', 'percentage'):
                try:
                    query[col] = float(val)
                except ValueError:
                    pass
            elif ftype in ('checkbox', 'switch', 'boolean'):
                query[col] = val.lower() in ('true', '1', 'yes')
            elif ftype in ('select', 'radio', 'date', 'datetime', 'time'):
                query[col] = val
            else:
                query[col] = {'$regex': val, '$options': 'i'}

        # Date / datetime / time range filters
        if ftype in ('date', 'datetime', 'time'):
            gte = request.GET.get(f'filter_{col}_gte')
            lte = request.GET.get(f'filter_{col}_lte')
            if gte or lte:
                query[col] = {}
                if gte:
                    query[col]['$gte'] = gte
                if lte:
                    query[col]['$lte'] = lte

    total   = db[collection_name].count_documents(query)
    records = list(db[collection_name].find(query)
                   .sort(sort_by, sort_order)
                   .skip((page - 1) * page_size)
                   .limit(page_size))
    for r in records:
        r['_id'] = str(r['_id'])
        for k, v in r.items():
            if isinstance(v, datetime.datetime):
                r[k] = v.isoformat()

    # Footer aggregations (same filtered query scope)
    footer_values = {}
    if footer:
        pipeline = []
        if query:
            pipeline.append({'$match': query})
        pipeline.append({'$group': {
            '_id': None,
            **{f'{col}_sum': {'$sum': f'${col}'}
               for col in footer}
        }})
        agg_result = list(db[collection_name].aggregate(pipeline))
        if agg_result:
            for col in footer:
                footer_values[col] = agg_result[0].get(f'{col}_sum', 0)
                footer_values[f'{col}_aggregation'] = 'sum'

    return Response({
        'page_config': {
            '_id':          str(page_config['_id']),
            'form_name':    page_config['form_name'],
            'display_name': page_config.get('display_name'),
            'form_ref':     form_ref,
            'columns':      columns,
            'actions':      page_config.get('actions', []),
            'footer':       footer,
            'filters':      page_config.get('filters', []),
            'source_fields': source_fields,
        },
        'results':      records,
        'total':        total,
        'page':         page,
        'page_size':    page_size,
        'footer_values': footer_values,
    })


# ──────────────────────────────────────────────
# REPORT CONFIGURATION  (join-based views)
# ──────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def report_configs(request):
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=400)

    db = get_tenant_db(db_name)

    if request.method == 'GET':
        reports = list(db['dynamic_forms'].find({'type': 'report'}).sort('created_at', -1))
        for r in reports:
            r['_id'] = str(r['_id'])
            if isinstance(r.get('created_at'), datetime.datetime):
                r['created_at'] = r['created_at'].isoformat()
        return Response({'results': reports, 'total': len(reports)})

    data      = request.data
    form_name = data.get('form_name', '').strip().lower().replace(' ', '_')
    if not form_name:
        return Response({'error': 'form_name is required'}, status=400)
    if db['dynamic_forms'].find_one({'form_name': form_name}):
        return Response({'error': f'"{form_name}" already exists'}, status=409)

    now = datetime.datetime.utcnow()
    report = {
        'form_name':        form_name,
        'display_name':     data.get('display_name', form_name.replace('_', ' ').title()),
        'category':         data.get('category', ''),
        'type':             'report',
        'base_collection':  data.get('base_collection', ''),
        'joins':            data.get('joins', []),
        'columns':          data.get('columns', []),
        'grouping_enabled':  bool(data.get('grouping_enabled', False)),
        'invoice_enabled':   bool(data.get('invoice_enabled', False)),
        'invoice_config':    data.get('invoice_config', {}),
        'created_by':        str(request.user.id),
        'created_at':       now,
        'updated_at':       now,
        'is_active':        True,
    }
    result = db['dynamic_forms'].insert_one(report)
    report['_id'] = str(result.inserted_id)
    return Response({'message': f'Report "{form_name}" created', 'report': report}, status=201)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def report_config_detail(request, report_name):
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=400)

    db = get_tenant_db(db_name)
    report = db['dynamic_forms'].find_one({'form_name': report_name, 'type': 'report'})
    if not report:
        return Response({'error': 'Report not found'}, status=404)

    if request.method == 'GET':
        report['_id'] = str(report['_id'])
        if isinstance(report.get('created_at'), datetime.datetime):
            report['created_at'] = report['created_at'].isoformat()
        return Response(report)

    if request.method == 'PUT':
        data   = request.data
        update = {'updated_at': datetime.datetime.utcnow()}
        for field in ('display_name', 'category', 'base_collection', 'joins', 'columns', 'grouping_enabled', 'invoice_enabled', 'invoice_config'):
            if field in data:
                update[field] = data[field]
        db['dynamic_forms'].update_one({'form_name': report_name}, {'$set': update})
        return Response({'message': f'Report "{report_name}" updated'})

    db['dynamic_forms'].delete_one({'form_name': report_name})
    return Response({'message': f'Report "{report_name}" deleted'})


def _serialize_doc(doc: dict):
    """Recursively convert ObjectId / datetime inside a Mongo document."""
    for k, v in list(doc.items()):
        if isinstance(v, datetime.datetime):
            doc[k] = v.isoformat()
        elif isinstance(v, ObjectId):
            doc[k] = str(v)
        elif isinstance(v, dict):
            _serialize_doc(v)
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, dict):
                    _serialize_doc(item)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def report_data(request, report_name):
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=400)

    db     = get_tenant_db(db_name)
    config = db['dynamic_forms'].find_one({'form_name': report_name, 'type': 'report'})
    if not config:
        return Response({'error': 'Report not found'}, status=404)

    base_col  = f"records_{config['base_collection']}"
    joins     = config.get('joins', [])
    columns   = config.get('columns', [])
    page      = int(request.GET.get('page', 1))
    page_size = int(request.GET.get('page_size', 20))
    search    = request.GET.get('search', '')
    sort_by   = request.GET.get('sort_by', 'created_at')
    sort_order = -1 if request.GET.get('sort_order', 'desc') == 'desc' else 1

    # ── Build the $lookup pipeline ────────────────────────────
    base_pipeline = []
    for join in joins:
        join_col      = f"records_{join['collection']}"
        local_field   = join['local_field']
        foreign_field = join.get('foreign_field', '_id')
        alias         = join['as']

        if foreign_field == '_id':
            # Coerce both sides to string so the match works whether the local
            # field stores a plain string, an ObjectId, or a numeric id.
            # Guard against null local_field to avoid matching empty strings.
            base_pipeline.append({
                '$lookup': {
                    'from': join_col,
                    'let':  {'lval': {'$toString': f'${local_field}'}},
                    'pipeline': [
                        {'$addFields': {'__sid': {'$toString': '$_id'}}},
                        {'$match': {'$expr': {
                            '$and': [
                                {'$ne': ['$$lval', '']},
                                {'$eq': ['$$lval', '$__sid']},
                            ]
                        }}},
                    ],
                    'as': alias,
                }
            })
        else:
            # For non-_id foreign fields, also coerce both sides to string
            base_pipeline.append({
                '$lookup': {
                    'from': join_col,
                    'let':  {'lval': {'$toString': f'${local_field}'}},
                    'pipeline': [
                        {'$addFields': {'__fval': {'$toString': f'${foreign_field}'}}},
                        {'$match': {'$expr': {
                            '$and': [
                                {'$ne': ['$$lval', '']},
                                {'$eq': ['$$lval', '$__fval']},
                            ]
                        }}},
                    ],
                    'as': alias,
                }
            })
        # Left-join: keep base records even when join has no match
        base_pipeline.append({
            '$unwind': {'path': f'${alias}', 'preserveNullAndEmptyArrays': True}
        })

    # ── Search (across text fields on the base collection) ────
    if search:
        base_form = db['dynamic_forms'].find_one(
            {'form_name': config['base_collection'], 'type': 'input'}
        )
        text_fields = [
            f['key'] for f in (base_form or {}).get('fields', [])
            if f['type'] in ('text', 'textarea', 'email', 'phone', 'url')
        ]
        if text_fields:
            base_pipeline.append({'$match': {'$or': [
                {fk: {'$regex': search, '$options': 'i'}} for fk in text_fields
            ]}})

    # ── Group & aggregate (optional) ──────────────────────────
    grouping_enabled = config.get('grouping_enabled', False)
    group_by_cols    = [c for c in columns if c.get('group_by')]
    agg_cols         = [c for c in columns if (c.get('aggregation') or 'none') != 'none']

    def _key_alias(key: str) -> str:
        return key.replace('.', '__')

    def _set_dotted(record: dict, key: str, value):
        parts = key.split('.')
        d = record
        for p in parts[:-1]:
            d = d.setdefault(p, {})
        d[parts[-1]] = value

    if grouping_enabled and (group_by_cols or agg_cols):
        group_id = {_key_alias(c['key']): f'${c["key"]}' for c in group_by_cols} or None
        group_doc: dict = {'_id': group_id}
        for col in agg_cols:
            alias = _key_alias(col['key'])
            op    = col.get('aggregation', 'sum')
            if op == 'count':
                group_doc[alias] = {'$sum': 1}
            else:
                group_doc[alias] = {f'${op}': f'${col["key"]}'}

        group_pipeline = base_pipeline + [{'$group': group_doc}]

        # Count
        count_result = list(db[base_col].aggregate(group_pipeline + [{'$count': 'n'}]))
        total = count_result[0]['n'] if count_result else 0

        # Determine sort field (use first group_by key alias, or first agg alias)
        if group_by_cols:
            g_sort = _key_alias(group_by_cols[0]['key'])
            sort_stage = {'$sort': {f'_id.{g_sort}': sort_order}} if isinstance(group_id, dict) else {'$sort': {'_id': sort_order}}
        else:
            sort_stage = {'$sort': {_key_alias(agg_cols[0]['key']): sort_order}}

        raw_records = list(db[base_col].aggregate(
            group_pipeline + [
                sort_stage,
                {'$skip': (page - 1) * page_size},
                {'$limit': page_size},
            ]
        ))

        records = []
        for raw in raw_records:
            r: dict = {}
            id_val = raw.get('_id')
            for col in group_by_cols:
                alias = _key_alias(col['key'])
                val   = id_val.get(alias) if isinstance(id_val, dict) else id_val
                _set_dotted(r, col['key'], val)
            for col in agg_cols:
                alias = _key_alias(col['key'])
                raw_val = raw.get(alias)
                if isinstance(raw_val, float) and raw_val == int(raw_val):
                    raw_val = int(raw_val)
                _set_dotted(r, col['key'], raw_val)
            _serialize_doc(r)
            records.append(r)

        return Response({
            'config': {
                '_id':             str(config['_id']),
                'form_name':       config['form_name'],
                'display_name':    config.get('display_name', ''),
                'columns':         columns,
                'grouping_enabled': True,
            },
            'results':   records,
            'total':     total,
            'page':      page,
            'page_size': page_size,
        })

    # ── Count total before pagination ──────────────────────────
    count_result = list(db[base_col].aggregate(base_pipeline + [{'$count': 'n'}]))
    total = count_result[0]['n'] if count_result else 0

    # ── Data with sort + pagination ────────────────────────────
    records = list(db[base_col].aggregate(
        base_pipeline + [
            {'$sort': {sort_by: sort_order}},
            {'$skip': (page - 1) * page_size},
            {'$limit': page_size},
        ]
    ))
    for r in records:
        _serialize_doc(r)

    col_keys = {col['key'] for col in columns}

    # Build per-field resolution maps for base and joined collections
    # option_maps: {col_key → {str(value): label}}   for select/radio/etc.
    # tvk_maps:    {col_key → storage_key}            for api_select/dependent_select
    option_maps = {}
    tvk_maps = {}

    def _collect_field_maps(fields_cfg, prefix=''):
        for field in fields_cfg:
            ftype = field.get('type', '')
            fkey  = field['key']
            col_key = f"{prefix}.{fkey}" if prefix else fkey
            if col_key not in col_keys:
                continue
            if ftype in ('select', 'radio', 'checkbox', 'multi_select') and field.get('options'):
                option_maps[col_key] = {
                    str(opt.get('value', '')): opt.get('label', str(opt.get('value', '')))
                    for opt in field['options']
                }
            elif ftype in ('api_select', 'dependent_select'):
                tvk = field.get('table_value_key', '')
                if tvk:
                    # Display label is stored under "{fkey}_{tvk}" on the record
                    tvk_maps[col_key] = f"{fkey}_{tvk}"

    base_form_cfg = db['dynamic_forms'].find_one({'form_name': config['base_collection'], 'type': 'input'})
    if base_form_cfg:
        _collect_field_maps(base_form_cfg.get('fields', []))

    for join in joins:
        join_form_cfg = db['dynamic_forms'].find_one({'form_name': join['collection'], 'type': 'input'})
        if join_form_cfg:
            _collect_field_maps(join_form_cfg.get('fields', []), prefix=join['as'])

    def _set_nested(record, col_key, value):
        if '.' in col_key:
            prefix, sub = col_key.split('.', 1)
            nested = record.get(prefix)
            if isinstance(nested, dict):
                nested[sub] = value
        else:
            record[col_key] = value

    def _get_nested(record, col_key):
        if '.' in col_key:
            prefix, sub = col_key.split('.', 1)
            nested = record.get(prefix)
            return nested.get(sub) if isinstance(nested, dict) else None
        return record.get(col_key)

    # Join aliases: after $lookup these keys hold nested dicts — never overwrite them
    join_aliases = {j['as'] for j in joins}

    for r in records:
        # Resolve select option values → labels
        for col_key, opt_map in option_maps.items():
            if col_key in join_aliases:
                continue
            raw = _get_nested(r, col_key)
            if raw is not None:
                resolved = [opt_map.get(str(v), v) for v in raw] if isinstance(raw, list) \
                           else opt_map.get(str(raw), raw)
                _set_nested(r, col_key, resolved)

        # Resolve api_select/dependent_select: replace UID with stored display label
        for col_key, storage_key in tvk_maps.items():
            if '.' in col_key:
                # Join field: label stored inside the nested joined document
                join_alias = col_key.split('.', 1)[0]
                nested = r.get(join_alias)
                if isinstance(nested, dict):
                    label = nested.get(storage_key)
                    if label is not None:
                        _set_nested(r, col_key, label)
            else:
                # Base field: skip if this key is a join alias (it holds a joined doc)
                if col_key in join_aliases:
                    continue
                label = r.get(storage_key)
                if label is not None:
                    _set_nested(r, col_key, label)

    return Response({
        'config': {
            '_id':          str(config['_id']),
            'form_name':    config['form_name'],
            'display_name': config.get('display_name', ''),
            'columns':      columns,
        },
        'results':   records,
        'total':     total,
        'page':      page,
        'page_size': page_size,
    })


def _apply_edit_with_new_updates(db, collection_name: str, record_data: dict, fields: list):
    """After saving a new record, find edit_with_new fields and apply update rules to the old record."""
    for field in fields:
        if field.get('type') != 'edit_with_new':
            continue
        if not field.get('update_on_save'):
            continue
        reference_key = field.get('reference_key', '').strip()
        if not reference_key:
            continue
        ref_value = record_data.get(field['key'])
        if ref_value is None:
            continue
        rules = field.get('ewn_update_rules', [])
        set_ops = {r['field_key']: r['value'] for r in rules if r.get('field_key')}
        if not set_ops:
            continue

        # Build candidate values to try: string, int, float — uid fields store integers
        candidates = [ref_value]
        try:
            candidates.append(int(ref_value))
        except (ValueError, TypeError):
            pass
        try:
            v = float(ref_value)
            if v not in candidates:
                candidates.append(v)
        except (ValueError, TypeError):
            pass

        now = datetime.datetime.utcnow()
        for candidate in candidates:
            try:
                result = db[collection_name].update_one(
                    {reference_key: candidate, 'is_deleted': {'$ne': True}},
                    {'$set': {**set_ops, 'updated_at': now}},
                )
                if result.modified_count > 0:
                    break
            except Exception as e:
                logger.warning(f"edit_with_new update failed for {collection_name} ref={candidate}: {e}")


def _validate_field_value(value, field: dict):
    field_type = field['type']
    validation = field.get('validation', {})

    if field_type in ('number', 'currency', 'percentage'):
        try:
            value = float(value)
        except (ValueError, TypeError):
            raise ValueError("Must be a number")
        if validation.get('min') is not None and value < float(validation['min']):
            raise ValueError(f"Must be at least {validation['min']}")
        if validation.get('max') is not None and value > float(validation['max']):
            raise ValueError(f"Must be at most {validation['max']}")

    elif field_type in ('text', 'textarea'):
        value = str(value)
        if validation.get('min_length') and len(value) < int(validation['min_length']):
            raise ValueError(f"Must be at least {validation['min_length']} characters")
        if validation.get('max_length') and len(value) > int(validation['max_length']):
            raise ValueError(f"Must be at most {validation['max_length']} characters")

    elif field_type == 'email':
        import re
        if not re.match(r'^[^@]+@[^@]+\.[^@]+$', str(value)):
            raise ValueError("Invalid email address")

    elif field_type in ('select', 'radio'):
        options = [opt.get('value', opt) for opt in field.get('options', [])]
        if options and value not in options:
            raise ValueError(f"Invalid selection")

    elif field_type in ('checkbox', 'switch'):
        value = bool(value)

    elif field_type == 'sub_form':
        # Sub-form value is an array of row objects — return as-is
        if isinstance(value, list):
            return value
        return []

    elif field_type == 'edit_with_new':
        return str(value) if value is not None else value

    return value
