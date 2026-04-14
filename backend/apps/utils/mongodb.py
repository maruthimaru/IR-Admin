"""
MongoDB Connection Manager - Multi-Tenant Support
Handles separate database connections per tenant/company
"""
import logging
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, OperationFailure
from django.conf import settings
from functools import lru_cache

logger = logging.getLogger(__name__)


class MongoDBManager:
    """
    Manages MongoDB connections for multi-tenant architecture.
    Each company/tenant gets its own database.
    """
    _instance = None
    _clients = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def get_client(self) -> MongoClient:
        """Get or create the main MongoDB client."""
        if 'main' not in self._clients:
            try:
                client = MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=5000)
                # Verify connection
                client.admin.command('ping')
                self._clients['main'] = client
                logger.info("Connected to MongoDB successfully")
            except ConnectionFailure as e:
                logger.error(f"MongoDB connection failed: {e}")
                raise
        return self._clients['main']

    def get_main_db(self):
        """Get the main database (for companies, users, global data)."""
        client = self.get_client()
        return client[settings.MONGO_MAIN_DB]

    def get_tenant_db(self, db_name: str):
        """
        Get database for a specific tenant/company.
        Each company has its own isolated database.
        """
        if not db_name:
            raise ValueError("Database name is required")

        # Sanitize db_name to prevent injection
        db_name = db_name.replace(' ', '_').lower()
        if not db_name.isidentifier() and not all(c.isalnum() or c == '_' for c in db_name):
            raise ValueError(f"Invalid database name: {db_name}")

        client = self.get_client()
        return client[db_name]

    def close_all(self):
        """Close all MongoDB connections."""
        for client in self._clients.values():
            client.close()
        self._clients.clear()


# Singleton instance
mongo_manager = MongoDBManager()


def get_main_db():
    """Shortcut to get main database."""
    return mongo_manager.get_main_db()


def get_tenant_db(db_name: str):
    """Shortcut to get tenant database."""
    return mongo_manager.get_tenant_db(db_name)


class MongoCollection:
    """
    Helper class for MongoDB collection operations with error handling.
    Supports both main and tenant databases.
    """

    def __init__(self, collection_name: str, db_name: str = None):
        self.collection_name = collection_name
        if db_name:
            self.db = get_tenant_db(db_name)
        else:
            self.db = get_main_db()
        self.collection = self.db[collection_name]

    def find_one(self, query: dict) -> dict:
        """Find a single document."""
        try:
            return self.collection.find_one(query)
        except Exception as e:
            logger.error(f"Error finding document in {self.collection_name}: {e}")
            raise

    def find_many(self, query: dict = None, skip: int = 0, limit: int = 20,
                  sort: list = None) -> list:
        """Find multiple documents with pagination."""
        try:
            cursor = self.collection.find(query or {})
            if sort:
                cursor = cursor.sort(sort)
            cursor = cursor.skip(skip).limit(limit)
            return list(cursor)
        except Exception as e:
            logger.error(f"Error finding documents in {self.collection_name}: {e}")
            raise

    def count(self, query: dict = None) -> int:
        """Count documents matching query."""
        return self.collection.count_documents(query or {})

    def insert_one(self, document: dict) -> str:
        """Insert a single document."""
        try:
            result = self.collection.insert_one(document)
            return str(result.inserted_id)
        except Exception as e:
            logger.error(f"Error inserting document into {self.collection_name}: {e}")
            raise

    def insert_many(self, documents: list) -> list:
        """Insert multiple documents."""
        try:
            result = self.collection.insert_many(documents)
            return [str(id) for id in result.inserted_ids]
        except Exception as e:
            logger.error(f"Error inserting documents into {self.collection_name}: {e}")
            raise

    def update_one(self, query: dict, update: dict, upsert: bool = False) -> int:
        """Update a single document."""
        try:
            result = self.collection.update_one(query, {'$set': update}, upsert=upsert)
            return result.modified_count
        except Exception as e:
            logger.error(f"Error updating document in {self.collection_name}: {e}")
            raise

    def delete_one(self, query: dict) -> int:
        """Delete a single document."""
        try:
            result = self.collection.delete_one(query)
            return result.deleted_count
        except Exception as e:
            logger.error(f"Error deleting document from {self.collection_name}: {e}")
            raise

    def aggregate(self, pipeline: list) -> list:
        """Run aggregation pipeline."""
        try:
            return list(self.collection.aggregate(pipeline))
        except Exception as e:
            logger.error(f"Error running aggregation on {self.collection_name}: {e}")
            raise

    def create_index(self, keys: list, unique: bool = False, **kwargs):
        """Create an index on the collection."""
        try:
            return self.collection.create_index(keys, unique=unique, **kwargs)
        except Exception as e:
            logger.error(f"Error creating index on {self.collection_name}: {e}")
            raise


class TransactionManager:
    """
    Manages MongoDB transactions for critical billing operations.
    Implements the transaction flow from the project spec.
    """

    def __init__(self, db_name: str = None):
        self.db_name = db_name
        self.client = mongo_manager.get_client()

    def execute_billing_transaction(self, invoice_data: dict, payment_data: dict,
                                     db_name: str) -> dict:
        """
        Execute a billing transaction with MongoDB ACID transactions.
        Flow: Start → Insert Invoice → Insert Payment → Commit
        If any step fails → Rollback
        """
        db = get_tenant_db(db_name)

        with self.client.start_session() as session:
            try:
                with session.start_transaction():
                    # Step 1: Insert Invoice
                    invoice_result = db['invoices'].insert_one(
                        invoice_data, session=session
                    )
                    invoice_id = str(invoice_result.inserted_id)

                    # Step 2: Insert Payment linked to invoice
                    payment_data['invoice_id'] = invoice_id
                    payment_result = db['payments'].insert_one(
                        payment_data, session=session
                    )
                    payment_id = str(payment_result.inserted_id)

                    # Step 3: Update balance/ledger
                    db['ledger'].insert_one({
                        'invoice_id': invoice_id,
                        'payment_id': payment_id,
                        'amount': payment_data.get('amount', 0),
                        'type': 'payment',
                    }, session=session)

                    # Commit if all steps succeed
                    logger.info(f"Transaction committed: invoice={invoice_id}, payment={payment_id}")
                    return {
                        'success': True,
                        'invoice_id': invoice_id,
                        'payment_id': payment_id,
                    }

            except Exception as e:
                # Automatic rollback when exiting context with error
                logger.error(f"Transaction failed, rolling back: {e}")
                raise
