// Make scenarios that work for the intake side: their failures (pulled into
// system_logs by the Make health poller) belong on Intake Activity, not on the
// content Activity & Logs page. Matched by the scenario's name in Make.
export const INTAKE_SCENARIOS = ["Dashboard - Send email"]

export const isIntakeLog = (log: { scenario_name: string | null }) => INTAKE_SCENARIOS.includes(log.scenario_name?.trim() ?? "")
