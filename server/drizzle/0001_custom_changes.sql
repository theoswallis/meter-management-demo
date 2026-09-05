CREATE VIEW meter_reading_usage AS
SELECT 
    r.id,
    r.meter_id,
    r.read_at,
    r.reading_value,
    LAG(r.reading_value) OVER w AS previous_reading_value,
    LAG(r.read_at)       OVER w AS previous_read_at,
    r.reading_value - LAG(r.reading_value) OVER w AS usage,
    r.read_at - LAG(r.read_at) OVER w AS time_elapsed
FROM meter_readings r
WINDOW w AS (PARTITION BY r.meter_id ORDER BY r.read_at);