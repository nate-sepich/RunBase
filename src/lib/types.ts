export interface MileSplit {
  mile: number;
  moving_time_seconds: number;
  average_speed_meters_per_second: number;
  average_heartrate?: number;
}

export interface PostRunMeta {
  matched_plan?: {
    week: number;
    theme?: string;
    date: string;
    session: {
      day: string;
      type: string;
      distance_miles: number | null;
      pace_target: string | null;
      hr_zone: string | null;
      hr_bpm_range: string | null;
      notes: string;
    };
  };
  adherence?: {
    status: 'matched' | 'modified' | 'off_plan';
    summary: string;
    actual_distance_miles: number;
    actual_pace_per_mile: string;
  };
  reflection?: {
    prompt_channel?: 'telegram';
    prompt_target?: string;
    prompt_sent_at?: string;
    prompt_text?: string;
    reply_text?: string;
    reply_received_at?: string;
  };
}

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
  splits_standard?: MileSplit[];
  post_run?: PostRunMeta;
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
