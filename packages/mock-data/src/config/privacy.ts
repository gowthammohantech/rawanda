/**
 * Small-cell suppression threshold for aggregate analytics (FND-06 consumes it). Counts with
 * `0 < value < DEMO_SMALL_CELL_THRESHOLD` are suppressed; zero is shown. Demo value pending
 * data-governance confirmation (INDEX open item 6).
 */
export const DEMO_SMALL_CELL_THRESHOLD = 5;
