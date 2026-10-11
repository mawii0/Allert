// Server-owned assignments; never infer access from email, profile fields or browser flags.
export function hasNodeAccess(assignment, userId, nodeId = "node-1") {
  return !!assignment && assignment.schema_version === 1
    && assignment.user_id === userId && assignment.node_id === nodeId
    && assignment.active === true;
}
export const assignmentKey = (userId, nodeId = "node-1") => `node-assignment:v1:${userId}:${nodeId}`;

export const sensorShareKey = userId => `sensor-share:v1:${userId}`;
export function sharedSensorId(record, userId) {
  return record?.schema_version === 1 && record.user_id === userId && record.active === true
    && typeof record.device_id === "string" && record.device_id.length > 0 && record.device_id.length <= 128
    ? record.device_id : null;
}
