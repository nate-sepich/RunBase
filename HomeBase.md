System Architecture & Implementation Directive: Project HomeBase (MVP)
1. System Objective
Develop a zero-infrastructure, automated running portfolio. The system will ingest raw telemetry from the Strava API, process it into a static JSON data store committed directly to the repository, and generate a static frontend to display the athlete's performance metrics.

2. Tech Stack Constraints
Data Ingestion: Node.js or Python script executed via GitHub Actions.

Database Layer: A strictly typed runs.json file living in the main branch.

Frontend: A modern Static Site Generator (Agent to choose Astro or Next.js Static Export based on optimal performance).

Hosting: GitHub Pages.

Styling: Tailwind CSS (strict utility classes, no custom CSS files unless unavoidable).

3. Data Schema Definition (runs.json)
The core data lake. The ingestion script must map Strava API responses to this exact structure. Do not deviate or add unverified fields.

JSON
{
  "last_updated": "ISO-8601-Timestamp",
  "athlete": {
    "name": "Gabe",
    "bio": "Striving for the apex."
  },
  "activities": [
    {
      "id": "String (Strava Activity ID for deduplication)",
      "date": "ISO-8601-Timestamp",
      "type": "String (Enum: 'workout', 'long_run', 'race')",
      "name": "String",
      "distance_meters": "Float",
      "moving_time_seconds": "Integer",
      "total_elevation_gain_meters": "Float",
      "average_speed_meters_per_second": "Float",
      "max_heartrate": "Integer (Optional)",
      "average_heartrate": "Integer (Optional)",
      "is_pr": "Boolean",
      "pr_distance": "String (Optional, e.g., '5k', '10k', 'Half Marathon')"
    }
  ],
  "upcoming_events": [
    {
      "event_name": "String",
      "date": "ISO-8601-Timestamp",
      "location": "String",
      "target_distance": "String",
      "a_goal": "String",
      "b_goal": "String"
    }
  ]
}
4. The ETL Pipeline (GitHub Actions)
The agent must generate a .github/workflows/etl.yml file with the following operational parameters:

Trigger: Cron schedule (run every 12 hours) AND workflow_dispatch for manual triggers.

Environment Variables: Must utilize GitHub Secrets for STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN.

Execution Logic (The Ingestion Script):

Authenticate with Strava and fetch activities from the last 7 days.

Read the existing runs.json from the repository.

Deduplication Rule: Check new activities against existing id fields in runs.json. If id exists, overwrite (to capture post-run edits). If id is new, append.

Filter out activities that do not meet the criteria for 'workout', 'long_run', or 'race' (logic to be defined by duration or manual Strava tags).

Write the updated JSON back to the file system.

Commit & Deploy: Commit the modified runs.json using a bot account. This commit must cascade into the standard static site build and deploy job.

5. Frontend UI Requirements
The frontend must be statically generated at build time by reading the runs.json file. It requires three distinct views:

The Timeline: A chronological list rendering the activities array. Must convert meters/seconds into human-readable imperial or metric formats (Miles, Pace in MM:SS).

The PR Board: A dedicated visual component filtering the activities array for "is_pr": true, highlighting the fastest times at standard distances.

The Horizon: A tabular or card-based layout rendering the upcoming_events array.

6. Agent Directives
Idempotency: Ensure the ingestion script can be run 100 times in a row without duplicating data or corrupting the JSON structure.

Error Handling: If the Strava API rate limits or fails, the GitHub Action must fail gracefully without wiping the existing runs.json.

Simplicity: Adhere strictly to Occam's Razor. Do not introduce a database ORM, Docker containers, or dynamic server-side API routes.
