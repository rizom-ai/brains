-- Add vector index for efficient similarity search
CREATE INDEX entities_embedding_idx ON entities(libsql_vector_idx(embedding));