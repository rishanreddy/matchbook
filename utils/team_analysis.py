"""Team data analysis and statistics calculations."""

from .temp_uploads import load_combined_data_from_temp
from .csv_operations import load_all_rows


def get_team_data(team_number, temp_filenames=None):
    """Get all match data for a specific team.

    Args:
        team_number: Team number to filter for
        temp_filenames: Optional list of temporary filenames to load from

    Returns:
        List of match dicts for the specified team
    """
    all_rows = load_all_rows() if temp_filenames is None else load_combined_data_from_temp(temp_filenames)
    team_matches = [
        row for row in all_rows if str(row.get("team", "")) == str(team_number)
    ]
    return team_matches


def calculate_team_stats(team_number, stat_fields=None, temp_filenames=None):
    """Calculate statistics for a team across all their matches.

    Args:
        team_number: Team number to analyze
        stat_fields: List of field names to calculate stats for.
                    Defaults to ["auto_score", "teleop_score"]
        temp_filenames: Optional list of temporary filenames to load from

    Returns:
        Dict with structure:
        {
            "team_number": int,
            "total_matches": int,
            "stats": {
                "field_name": {
                    "average": float,
                    "max": float,
                    "min": float,
                    "total": float
                },
                ...
            },
            "matches": [list of match dicts]
        }
    """

    matches = get_team_data(team_number, temp_filenames)

    if not matches:
        return {"team_number": team_number, "total_matches": 0, "stats": {}}

    if stat_fields is None:
        stat_fields = ["auto_score", "teleop_score"]

    stats = {}
    for field in stat_fields:
        values = []
        for match in matches:
            val = match.get(field, "")
            try:
                values.append(float(val))
            except (ValueError, TypeError):
                continue

        if values:
            stats[field] = {
                "average": round(sum(values) / len(values), 2),
                "max": max(values),
                "min": min(values),
                "total": sum(values),
            }
        else:
            stats[field] = {"average": 0, "max": 0, "min": 0, "total": 0}

    return {
        "team_number": team_number,
        "total_matches": len(matches),
        "stats": stats,
        "matches": matches,
    }


def get_all_teams_summary(rows, stat_fields=None):
    """Generate a summary for all teams from CSV data.

    Args:
        rows: List of match data dicts (from uploaded CSV or local file)
        stat_fields: List of field names to calculate stats for.
                    Defaults to ["auto_score", "teleop_score"]

    Returns:
        List of team summary dicts, sorted by team number:
        [
            {
                "team_number": str,
                "total_matches": int,
                "stats": {
                    "field_name": {
                        "average": float,
                        "max": float,
                        "min": float
                    },
                    ...
                }
            },
            ...
        ]
    """
    if not rows:
        return []

    if stat_fields is None:
        stat_fields = ["auto_score", "teleop_score"]

    # Group by team
    teams_data = {}
    for row in rows:
        team = str(row.get("team", ""))
        if not team:
            continue

        if team not in teams_data:
            teams_data[team] = []
        teams_data[team].append(row)

    # Calculate summary for each team
    summaries = []
    for team_number, matches in teams_data.items():
        stats = {}
        for field in stat_fields:
            values = []
            for match in matches:
                val = match.get(field, "")
                try:
                    values.append(float(val))
                except (ValueError, TypeError):
                    continue

            if values:
                stats[field] = {
                    "average": round(sum(values) / len(values), 2),
                    "max": max(values),
                    "min": min(values),
                }
            else:
                stats[field] = {"average": 0, "max": 0, "min": 0}

        summaries.append(
            {"team_number": team_number, "total_matches": len(matches), "stats": stats}
        )

    # Sort by team number
    summaries.sort(
        key=lambda x: int(x["team_number"]) if x["team_number"].isdigit() else 0
    )
    return summaries

def get_all_teams(temp_filenames=None):
    """Returns a list of all unique team numbers from the CSV data."""
    all_rows = load_all_rows() if temp_filenames is None else load_combined_data_from_temp(temp_filenames)
    teams = set()
    for row in all_rows:
        team = str(row.get("team", ""))
        if team.isdigit():
            teams.add(int(team))
    return teams

def get_radar_data(team_number, stat_fields, temp_filenames=None):
    """Generates scores for given fields relative to the best team in the field for the radar graph."""

    team_data = calculate_team_stats(team_number, stat_fields, temp_filenames)

    radar_data = {}

    for field in stat_fields:
        best = 0

        for other in get_all_teams(temp_filenames):
            other_data = calculate_team_stats(other, stat_fields, temp_filenames)
            best = max(best, other_data["stats"][field]["average"])
            
        radar_data[field] = round(team_data["stats"][field]["average"] / best * 100, 2)

    return radar_data