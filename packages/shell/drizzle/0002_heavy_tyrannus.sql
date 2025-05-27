-- Create vector index for efficient similarity search
-- Note: libSQL vector functions are not supported in Drizzle schema definitions yet
CREATE INDEX entities_embedding_idx ON entities(libsql_vector_idx(embedding));