"""
Dynamic Form Engine - The Core of the Admin Panel
Handles form configuration, field management, and runtime data operations
"""
import logging
import datetime
from bson import ObjectId
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.utils.mongodb import get_tenant_db
from apps.core.middleware import get_tenant_db_name

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# FORM CONFIGURATION (Developer Panel)
# ──────────────────────────────────────────────

ALLOWED_FIELD_TYPES = [
    'text', 'number', 'email', 'phone', 'date', 'datetime',
    'select', 'multi_select', 'checkbox', 'radio', 'textarea',
    'file', 'image', 'currency', 'percentage', 'url', 'color',
    'rating', 'switch', 'hidden', 'formula', 'relation'
]


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def form_configs(request):
    """
    GET  - List all form configurations for a tenant
    POST - Create a new form configuration
    """
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=status.HTTP_400_BAD_REQUEST)

    db = get_tenant_db(db_name)

    if request.method == 'GET':
        page = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('page_size', 20))
        form_type = request.GET.get('type', None)  # 'input' or 'list'

        query = {}
        if form_type:
            query['type'] = form_type

        forms = list(db['dynamic_forms'].find(query)
                     .skip((page - 1) * page_size)
                     .limit(page_size)
                     .sort('created_at', -1))

        for f in forms:
            f['_id'] = str(f['_id'])

        return Response({
            'results': forms,
            'total': db['dynamic_forms'].count_documents(query),
        })

    elif request.method == 'POST':
        return _create_form_config(request, db)


def _create_form_config(request, db):
    """Create a new input or list form configuration."""
    data = request.data
    form_type = data.get('type', 'input')

    if form_type == 'input':
        return _create_input_form(data, db, request.user)
    elif form_type == 'list':
        return _create_list_page(data, db, request.user)
    else:
        return Response({'error': f'Invalid form type: {form_type}'}, status=400)


def _create_input_form(data: dict, db, user) -> Response:
    """
    Create an input form configuration.
    Example config:
    {
        "form_name": "purchase_entry",
        "type": "input",
        "fields": [
            {"label": "Item Name", "key": "item_name", "type": "text", "required": true},
            {"label": "Weight", "key": "weight", "type": "number"}
        ]
    }
    """
    form_name = data.get('form_name', '').strip().lower().replace(' ', '_')
    if not form_name:
        return Response({'error': 'form_name is required'}, status=400)

    if db['dynamic_forms'].find_one({'form_name': form_name}):
        return Response({'error': f'Form "{form_name}" already exists'}, status=409)

    fields = data.get('fields', [])
    validated_fields = _validate_fields(fields)
    if isinstance(validated_fields, Response):
        return validated_fields

    form_config = {
        'form_name': form_name,
        'display_name': data.get('display_name', form_name.replace('_', ' ').title()),
        'type': 'input',
        'fields': validated_fields,
        'settings': {
            'allow_edit': data.get('allow_edit', True),
            'allow_delete': data.get('allow_delete', True),
            'require_confirmation': data.get('require_confirmation', False),
            'max_records': data.get('max_records', None),
        },
        'layout': data.get('layout', 'vertical'),  # vertical, horizontal, grid
        'hooks': {
            'before_save': data.get('before_save_hook', None),
            'after_save': data.get('after_save_hook', None),
        },
        'permissions': data.get('permissions', {'roles': ['all']}),
        'created_by': str(user.id),
        'created_at': datetime.datetime.utcnow(),
        'updated_at': datetime.datetime.utcnow(),
        'is_active': True,
    }

    result = db['dynamic_forms'].insert_one(form_config)
    form_config['_id'] = str(result.inserted_id)

    # Auto-create the data collection for this form
    collection_name = f"records_{form_name}"
    _setup_form_collection(db, collection_name, validated_fields)

    logger.info(f"Input form created: {form_name}")
    return Response({
        'message': f'Form "{form_name}" created successfully',
        'form': form_config,
        'collection': collection_name,
    }, status=201)


def _create_list_page(data: dict, db, user) -> Response:
    """
    Create a list page configuration.
    Example:
    {
        "page_type": "list",
        "form_ref": "purchase_entry",
        "columns": ["item_name", "weight"],
        "footer": {"weight": "sum"},
        "actions": ["edit", "delete"]
    }
    """
    form_ref = data.get('form_ref', '').strip()
    if not form_ref:
        return Response({'error': 'form_ref is required for list pages'}, status=400)

    # Verify the referenced form exists
    source_form = db['dynamic_forms'].find_one({'form_name': form_ref, 'type': 'input'})
    if not source_form:
        return Response({'error': f'Source form "{form_ref}" not found'}, status=404)

    page_name = data.get('page_name', f'{form_ref}_list')
    columns = data.get('columns', [])
    footer = data.get('footer', {})  # e.g., {"weight": "sum", "price": "avg"}
    actions = data.get('actions', ['edit', 'delete'])

    # Validate footer aggregations
    valid_agg = ['sum', 'avg', 'min', 'max', 'count']
    for col, agg in footer.items():
        if agg not in valid_agg:
            return Response({'error': f'Invalid footer aggregation "{agg}" for column "{col}"'}, status=400)

    list_config = {
        'form_name': page_name,
        'display_name': data.get('display_name', page_name.replace('_', ' ').title()),
        'type': 'list',
        'form_ref': form_ref,
        'columns': columns,
        'footer': footer,
        'actions': actions,
        'filters': data.get('filters', []),  # Configurable filter fields
        'sorting': data.get('sorting', {'field': 'created_at', 'order': 'desc'}),
        'pagination': data.get('pagination', {'enabled': True, 'page_size': 20}),
        'search': data.get('search', {'enabled': True, 'fields': []}),
        'export': data.get('export', {'enabled': True, 'formats': ['csv', 'excel']}),
        'created_by': str(user.id),
        'created_at': datetime.datetime.utcnow(),
        'updated_at': datetime.datetime.utcnow(),
        'is_active': True,
    }

    if db['dynamic_forms'].find_one({'form_name': page_name, 'type': 'list'}):
        return Response({'error': f'List page "{page_name}" already exists'}, status=409)

    result = db['dynamic_forms'].insert_one(list_config)
    list_config['_id'] = str(result.inserted_id)

    logger.info(f"List page created: {page_name} → {form_ref}")
    return Response({
        'message': f'List page "{page_name}" created successfully',
        'page': list_config,
    }, status=201)


def _validate_fields(fields: list) -> list | Response:
    """Validate field definitions for a form."""
    if not fields:
        return Response({'error': 'At least one field is required'}, status=400)

    validated = []
    keys_seen = set()

    for i, field in enumerate(fields):
        label = field.get('label', '').strip()
        key = field.get('key', label.lower().replace(' ', '_')).strip()
        field_type = field.get('type', 'text')

        if not label:
            return Response({'error': f'Field {i+1}: label is required'}, status=400)

        if not key:
            return Response({'error': f'Field {i+1}: key is required'}, status=400)

        if field_type not in ALLOWED_FIELD_TYPES:
            return Response(
                {'error': f'Field "{key}": invalid type "{field_type}". Allowed: {ALLOWED_FIELD_TYPES}'},
                status=400
            )

        if key in keys_seen:
            return Response({'error': f'Duplicate field key: "{key}"'}, status=400)
        keys_seen.add(key)

        validated_field = {
            'label': label,
            'key': key,
            'type': field_type,
            'required': field.get('required', False),
            'placeholder': field.get('placeholder', ''),
            'default_value': field.get('default_value', None),
            'options': field.get('options', []),  # For select/radio
            'validation': {
                'min': field.get('min', None),
                'max': field.get('max', None),
                'min_length': field.get('min_length', None),
                'max_length': field.get('max_length', None),
                'pattern': field.get('pattern', None),
                'custom_message': field.get('validation_message', None),
            },
            'order': field.get('order', i),
            'width': field.get('width', 'full'),  # full, half, third
            'help_text': field.get('help_text', ''),
            'is_searchable': field.get('is_searchable', False),
            'is_sortable': field.get('is_sortable', False),
            'hidden': field.get('hidden', False),
        }
        validated.append(validated_field)

    return validated


def _setup_form_collection(db, collection_name: str, fields: list):
    """Create indexes for the form's data collection."""
    collection = db[collection_name]

    # Always create a created_at index for sorting
    collection.create_index([('created_at', -1)])

    # Create indexes for searchable/sortable fields
    for field in fields:
        if field.get('is_searchable') or field.get('is_sortable'):
            collection.create_index(field['key'])


# ──────────────────────────────────────────────
# RUNTIME DATA API (End Users)
# ──────────────────────────────────────────────

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def form_records(request, form_name):
    """
    GET  - List records for a form
    POST - Create a new record
    """
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=400)

    db = get_tenant_db(db_name)

    # Get form config
    form_config = db['dynamic_forms'].find_one({'form_name': form_name, 'type': 'input'})
    if not form_config:
        return Response({'error': f'Form "{form_name}" not found'}, status=404)

    collection_name = f"records_{form_name}"

    if request.method == 'GET':
        return _list_records(request, db, collection_name, form_config)
    elif request.method == 'POST':
        return _create_record(request, db, collection_name, form_config)


def _list_records(request, db, collection_name: str, form_config: dict) -> Response:
    """Fetch records with pagination, filtering, and sorting."""
    page = int(request.GET.get('page', 1))
    page_size = int(request.GET.get('page_size', 20))
    search = request.GET.get('search', '')
    sort_by = request.GET.get('sort_by', 'created_at')
    sort_order = -1 if request.GET.get('sort_order', 'desc') == 'desc' else 1

    query = {}

    # Apply search
    if search:
        searchable_fields = [f['key'] for f in form_config.get('fields', [])
                             if f.get('is_searchable')]
        if searchable_fields:
            query['$or'] = [
                {field: {'$regex': search, '$options': 'i'}}
                for field in searchable_fields
            ]

    # Apply filters from query params
    for field in form_config.get('fields', []):
        key = field['key']
        filter_val = request.GET.get(f'filter_{key}')
        if filter_val:
            query[key] = filter_val

    total = db[collection_name].count_documents(query)
    records = list(
        db[collection_name].find(query)
        .sort(sort_by, sort_order)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )

    for r in records:
        r['_id'] = str(r['_id'])

    # Compute footer aggregations if this is for a list page
    footer_data = {}

    return Response({
        'results': records,
        'total': total,
        'page': page,
        'page_size': page_size,
        'footer': footer_data,
    })


def _create_record(request, db, collection_name: str, form_config: dict) -> Response:
    """Create a new record with validation."""
    data = request.data
    fields = form_config.get('fields', [])

    # Validate against form config
    errors = {}
    validated_data = {}

    for field in fields:
        key = field['key']
        value = data.get(key)
        field_type = field['type']

        # Required field check
        if field.get('required') and (value is None or value == ''):
            errors[key] = f"{field['label']} is required"
            continue

        if value is None:
            continue

        # Type validation
        try:
            validated_data[key] = _validate_field_value(value, field)
        except ValueError as e:
            errors[key] = str(e)

    if errors:
        return Response({'errors': errors}, status=400)

    # Add metadata
    validated_data['created_by'] = str(request.user.id)
    validated_data['created_at'] = datetime.datetime.utcnow()
    validated_data['updated_at'] = datetime.datetime.utcnow()

    result = db[collection_name].insert_one(validated_data)
    validated_data['_id'] = str(result.inserted_id)

    # Audit log
    db['audit_logs'].insert_one({
        'action': 'create_record',
        'collection': collection_name,
        'record_id': str(result.inserted_id),
        'user_id': str(request.user.id),
        'created_at': datetime.datetime.utcnow(),
    })

    return Response({
        'message': 'Record created successfully',
        'record': validated_data,
    }, status=201)


@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def record_detail(request, form_name, record_id):
    """Get, update, or delete a specific record."""
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=400)

    db = get_tenant_db(db_name)
    collection_name = f"records_{form_name}"

    try:
        record = db[collection_name].find_one({'_id': ObjectId(record_id)})
    except Exception:
        return Response({'error': 'Invalid record ID'}, status=400)

    if not record:
        return Response({'error': 'Record not found'}, status=404)

    record['_id'] = str(record['_id'])

    if request.method == 'GET':
        return Response(record)

    elif request.method == 'PUT':
        form_config = db['dynamic_forms'].find_one({'form_name': form_name})
        fields = form_config.get('fields', []) if form_config else []

        update_data = {}
        errors = {}

        for field in fields:
            key = field['key']
            if key in request.data:
                try:
                    update_data[key] = _validate_field_value(request.data[key], field)
                except ValueError as e:
                    errors[key] = str(e)

        if errors:
            return Response({'errors': errors}, status=400)

        update_data['updated_at'] = datetime.datetime.utcnow()
        update_data['updated_by'] = str(request.user.id)

        db[collection_name].update_one(
            {'_id': ObjectId(record_id)},
            {'$set': update_data}
        )

        # Audit log
        db['audit_logs'].insert_one({
            'action': 'update_record',
            'collection': collection_name,
            'record_id': record_id,
            'user_id': str(request.user.id),
            'created_at': datetime.datetime.utcnow(),
        })

        return Response({'message': 'Record updated successfully'})

    elif request.method == 'DELETE':
        db[collection_name].delete_one({'_id': ObjectId(record_id)})

        db['audit_logs'].insert_one({
            'action': 'delete_record',
            'collection': collection_name,
            'record_id': record_id,
            'user_id': str(request.user.id),
            'created_at': datetime.datetime.utcnow(),
        })

        return Response({'message': 'Record deleted successfully'})


def _validate_field_value(value, field: dict):
    """Validate and coerce a field value based on its type."""
    field_type = field['type']
    validation = field.get('validation', {})

    if field_type == 'number' or field_type == 'currency' or field_type == 'percentage':
        try:
            value = float(value)
        except (ValueError, TypeError):
            raise ValueError(f"Must be a number")
        if validation.get('min') is not None and value < float(validation['min']):
            raise ValueError(f"Must be at least {validation['min']}")
        if validation.get('max') is not None and value > float(validation['max']):
            raise ValueError(f"Must be at most {validation['max']}")

    elif field_type == 'text' or field_type == 'textarea':
        value = str(value)
        if validation.get('min_length') and len(value) < int(validation['min_length']):
            raise ValueError(f"Must be at least {validation['min_length']} characters")
        if validation.get('max_length') and len(value) > int(validation['max_length']):
            raise ValueError(f"Must be at most {validation['max_length']} characters")

    elif field_type == 'email':
        import re
        if not re.match(r'^[^@]+@[^@]+\.[^@]+$', str(value)):
            raise ValueError("Invalid email address")

    elif field_type == 'select' or field_type == 'radio':
        options = [opt.get('value', opt) for opt in field.get('options', [])]
        if options and value not in options:
            raise ValueError(f"Invalid selection. Choose from: {options}")

    elif field_type == 'checkbox' or field_type == 'switch':
        value = bool(value)

    return value


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def form_config_detail(request, form_name):
    """Get a specific form configuration (for rendering)."""
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=400)

    db = get_tenant_db(db_name)
    form = db['dynamic_forms'].find_one({'form_name': form_name})

    if not form:
        return Response({'error': 'Form not found'}, status=404)

    form['_id'] = str(form['_id'])
    return Response(form)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_page_data(request, page_name):
    """
    Fetch data for a list page with footer aggregations.
    """
    db_name = get_tenant_db_name(request)
    if not db_name:
        return Response({'error': 'Tenant context required'}, status=400)

    db = get_tenant_db(db_name)
    page_config = db['dynamic_forms'].find_one({'form_name': page_name, 'type': 'list'})

    if not page_config:
        return Response({'error': 'List page not found'}, status=404)

    form_ref = page_config.get('form_ref')
    collection_name = f"records_{form_ref}"
    columns = page_config.get('columns', [])
    footer = page_config.get('footer', {})
    pagination = page_config.get('pagination', {})

    page = int(request.GET.get('page', 1))
    page_size = int(request.GET.get('page_size', pagination.get('page_size', 20)))

    # Build projection to only fetch needed columns
    projection = {col: 1 for col in columns}
    projection['_id'] = 1
    projection['created_at'] = 1

    records = list(
        db[collection_name].find({}, projection)
        .sort('created_at', -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )

    for r in records:
        r['_id'] = str(r['_id'])

    total = db[collection_name].count_documents({})

    # Compute footer aggregations
    footer_values = {}
    if footer:
        pipeline = [
            {'$group': {
                '_id': None,
                **{
                    f'{col}_{agg}': {
                        f'${agg}': f'${col}'
                    }
                    for col, agg in footer.items()
                    if agg in ('sum', 'avg', 'min', 'max')
                }
            }}
        ]
        agg_result = list(db[collection_name].aggregate(pipeline))
        if agg_result:
            for col, agg in footer.items():
                footer_values[col] = agg_result[0].get(f'{col}_{agg}', 0)
                footer_values[f'{col}_aggregation'] = agg

    return Response({
        'page_config': {
            '_id': str(page_config['_id']),
            'form_name': page_config['form_name'],
            'display_name': page_config.get('display_name'),
            'columns': columns,
            'actions': page_config.get('actions', []),
            'footer': footer,
        },
        'results': records,
        'total': total,
        'page': page,
        'page_size': page_size,
        'footer_values': footer_values,
    })
