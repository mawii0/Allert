export function sensorNoticeCopy(phase) {
  const key=typeof phase==='string'?phase.toLowerCase():'';
  if(key==='recovered')return {title:'Sudden spike',status:'Recovered',description:'Particle levels rose earlier. The readings no longer trigger this alert.'};
  if(['initial','ongoing','escalated','persistent','active'].includes(key))return {title:'Sudden spike',status:'Detected',description:'Your node detected unusually high or rising particle levels at this time.'};
  return {title:'Sudden spike',status:'Recorded',description:'This notice records unusually high or rising particle levels.'};
}
export function sensorMonitoringMessage(value) {
  if(!value?.device)return 'Link a node to see its notices.';
  if(!value.processorReady)return 'Monitoring is temporarily unavailable. Recent changes may not be shown.';
  if(!value.fresh)return 'No recent readings. Current conditions are unknown.';
  const state=String(value.detector?.decision?.state || '');
  return /warm|reference|collect/i.test(state)?'Collecting readings before checking for spikes.':'Watching for sudden increases in particle levels.';
}
