CREATE TABLE IF NOT EXISTS event_courts (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    court_number INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    CONSTRAINT fk_event_courts_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT uk_event_courts_event_court UNIQUE (event_id, court_number)
);
