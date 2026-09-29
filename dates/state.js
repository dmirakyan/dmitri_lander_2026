// Pure merge logic: remote acknowledgments never erase newer offline choices.
export function voteKey(v) { return `${v.actor}:${v.idea_id}`; }
export function mergeVotes(remote, pending = []) {
  const votes = {};
  for (const v of [...remote, ...pending]) {
    const key = voteKey(v);
    if (!votes[key] || Date.parse(v.client_at) >= Date.parse(votes[key].client_at)) votes[key] = v;
  }
  return votes;
}
export function remainingActions(outbox, sent) {
  const ids = new Set(sent.map(a => a.event_id));
  return outbox.filter(a => !ids.has(a.event_id));
}
