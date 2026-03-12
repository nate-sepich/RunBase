export interface Activity {
  id: string;
  date: string;
  type: 'workout' | 'long_run' | 'race';
  name: string;
  distance_meters: number;
  moving_time_seconds: number;
  total_elevation_gain_meters: number;
  average_speed_meters_per_second: number;
  max_heartrate?: number;
  average_heartrate?: number;
  is_pr: boolean;
  pr_distance?: string;
  pr_time_seconds?: number;
}

export interface UpcomingEvent {
  event_name: string;
  date: string;
  location: string;
  target_distance: string;
  a_goal: string;
  b_goal: string;
}

export interface RunStore {
  last_updated: string;
  athlete: {
    name: string;
    bio: string;
  };
  activities: Activity[];
  upcoming_events: UpcomingEvent[];
}
