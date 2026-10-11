// Server-owned assignments; never infer access from email, profile fields or browser flags.
export function hasNodeAccess(assignment, userId, nodeId = "node-1") {
  return !!assignment && assignment.schema_version === 1
    && assignment.user_id === userId && assignment.node_id === nodeId
    && assignment.active === true;
}
export const assignmentKey = (userId, nodeId = "node-1") => `node-assignment:v1:${userId}:${nodeId}`;
