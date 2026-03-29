export interface TBAEvent {
  key: string
  name: string
  event_code: string
  event_type: number
  district?: {
    abbreviation: string
    display_name: string
  }
  city?: string
  state_prov?: string
  country?: string
  start_date: string
  end_date: string
  year: number
  short_name?: string
  event_type_string: string
  week?: number
}

export interface TBAMatch {
  key: string
  comp_level: string
  set_number: number
  match_number: number
  alliances: {
    red: {
      team_keys: string[]
      score: number
    }
    blue: {
      team_keys: string[]
      score: number
    }
  }
  winning_alliance?: string
  time?: number
  predicted_time?: number
  actual_time?: number
}

export interface TBATeam {
  key: string
  team_number: number
  nickname: string
  name: string
  city?: string
  state_prov?: string
  country?: string
  rookie_year?: number
}
