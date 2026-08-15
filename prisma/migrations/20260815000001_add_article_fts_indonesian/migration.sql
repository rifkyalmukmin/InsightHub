-- Full-text search for articles using the built-in Indonesian config.
-- The trigger keeps the vector in sync on insert/update of title/content;
-- existing rows are backfilled at the end.

-- Add the tsvector column (declared as Unsupported("tsvector") in schema)
ALTER TABLE "Article" ADD COLUMN "searchVector" tsvector;

-- GIN index so @@ tsquery lookups use the index instead of a seq scan
CREATE INDEX "Article_searchVector_idx" ON "Article" USING GIN ("searchVector");

-- Keep the vector in sync automatically
CREATE OR REPLACE FUNCTION "article_search_vector_update"() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('indonesian', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('indonesian', coalesce(NEW."content", '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_article_search_vector"
BEFORE INSERT OR UPDATE OF "title", "content" ON "Article"
FOR EACH ROW EXECUTE FUNCTION "article_search_vector_update"();

-- Backfill existing rows (title weighted higher than content)
UPDATE "Article"
SET "searchVector" =
  setweight(to_tsvector('indonesian', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('indonesian', coalesce("content", '')), 'B');
