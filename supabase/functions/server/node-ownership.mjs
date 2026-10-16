// Check again after an asynchronous read: a transfer can happen while data loads.
export async function currentNodeOwner(client, userId, device) {
  const query = client.from("sensor_devices").select("device_id,user_id,owner_since,is_active")
    .eq("device_id", device.device_id).eq("user_id", userId).eq("is_active", true).maybeSingle();
  // Let PostgreSQL compare the full timestamp, including sub-millisecond precision.
  if (device.owner_since) query.eq("owner_since", device.owner_since);
  const { data, error } = await query;
  if (error) throw Error("Node ownership could not be verified.");
  return !!data && Date.parse(data.owner_since || "1970-01-01T00:00:00Z") === Date.parse(device.owner_since || "1970-01-01T00:00:00Z");
}

export async function accessibleNode(client, userId) {
  const owned = await client.from("sensor_devices").select("device_id,user_id,owner_since,location_label,is_active").eq("user_id",userId).eq("is_active",true).limit(2);
  if(owned.error)throw Error("Node access could not be checked.");
  if(owned.data?.length>1)return undefined;
  if(owned.data?.length)return {...owned.data[0],role:"owner",owner_id:userId,access_since:owned.data[0].owner_since || "1970-01-01T00:00:00Z"};
  const memberships=await client.from("allert_node_memberships").select("device_id,owner_id,owner_epoch,joined_at").eq("user_id",userId).eq("active",true).limit(12);
  if(memberships.error)throw Error("Family access could not be checked.");
  const devices=[];
  for(const member of memberships.data || []) {
    const result=await client.from("sensor_devices").select("device_id,user_id,owner_since,location_label,is_active").eq("device_id",member.device_id).eq("user_id",member.owner_id).eq("is_active",true).maybeSingle();
    if(result.error)throw Error("Family node could not be checked.");
    if(result.data && Date.parse(result.data.owner_since || "1970-01-01T00:00:00Z")===Date.parse(member.owner_epoch))devices.push({...result.data,role:"member",owner_id:member.owner_id,access_since:member.joined_at,membership_since:member.joined_at});
  }
  return devices.length>1?undefined:devices[0] || null;
}
export async function currentNodeAccess(client,userId,device) {
  if(device.role!=="member")return currentNodeOwner(client,userId,device);
  if(!await currentNodeOwner(client,device.owner_id,device))return false;
  const {data,error}=await client.from("allert_node_memberships").select("joined_at").eq("device_id",device.device_id).eq("user_id",userId)
    .eq("owner_id",device.owner_id).eq("owner_epoch",device.owner_since || "1970-01-01T00:00:00Z").eq("joined_at",device.membership_since).eq("active",true).maybeSingle();
  if(error)throw Error("Family access could not be verified.");
  return !!data;
}
