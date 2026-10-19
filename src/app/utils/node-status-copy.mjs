// Display wording only: freshness of uploads is not a live hardware ping.
export function nodeStatusMessage(status) {
  return ({
    'Recent data':'Your node sent a reading within the last 10 minutes.',
    'No recent data':'No reading in the last 10 minutes. Check the node’s power and Wi-Fi.',
    'Waiting for first reading':'Node linked. Waiting for its first reading.',
    'No assigned node':'No node is linked to this account.',
    'Checking node…':'Refreshing the latest uploaded reading…',
    'Unable to check node':'Could not refresh readings. Please try again.',
    'Invalid reading time':'The latest reading has an invalid time. Check the node’s clock.',
  })[status] || status;
}
