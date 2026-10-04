import type { ApiEndpoint } from "@/scanner/models/endpoint";
import { scanKeyFromDraft, scanKeyFromEndpoint } from "./identity";
import type { CollectionRequestRef } from "./types";

export interface MatchedPair {
  scanKey: string;
  endpoint?: ApiEndpoint;
  request?: CollectionRequestRef;
  /** Extra endpoints sharing the same scanKey (duplicates). */
  endpointDupes?: ApiEndpoint[];
  /** Extra requests sharing the same scanKey. */
  requestDupes?: CollectionRequestRef[];
}

/**
 * Match collection requests to scanned endpoints by scanKey.
 * Ambiguous duplicates keep the best sourceFile/handler tie-break on the primary pair.
 */
export function matchRequestsToEndpoints(
  requests: CollectionRequestRef[],
  endpoints: ApiEndpoint[],
): MatchedPair[] {
  const endpointsByKey = new Map<string, ApiEndpoint[]>();
  for (const ep of endpoints) {
    const key = scanKeyFromEndpoint(ep);
    const list = endpointsByKey.get(key) ?? [];
    list.push(ep);
    endpointsByKey.set(key, list);
  }

  const requestsByKey = new Map<string, CollectionRequestRef[]>();
  for (const req of requests) {
    const key = scanKeyFromDraft(req.draft);
    const list = requestsByKey.get(key) ?? [];
    list.push(req);
    requestsByKey.set(key, list);
  }

  const allKeys = new Set([...endpointsByKey.keys(), ...requestsByKey.keys()]);
  const pairs: MatchedPair[] = [];

  for (const scanKey of [...allKeys].sort()) {
    const eps = endpointsByKey.get(scanKey) ?? [];
    const reqs = requestsByKey.get(scanKey) ?? [];

    if (eps.length === 0) {
      for (const request of reqs) {
        pairs.push({ scanKey, request });
      }
      continue;
    }
    if (reqs.length === 0) {
      for (const endpoint of eps) {
        pairs.push({ scanKey, endpoint });
      }
      continue;
    }

    // Pair greedily with sourceFile tie-break
    const usedReq = new Set<number>();
    const usedEp = new Set<number>();

    for (let ei = 0; ei < eps.length; ei++) {
      const ep = eps[ei];
      let bestIdx = -1;
      let bestScore = -1;
      for (let ri = 0; ri < reqs.length; ri++) {
        if (usedReq.has(ri)) continue;
        const score = tieBreakScore(ep, reqs[ri]);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = ri;
        }
      }
      if (bestIdx >= 0) {
        usedEp.add(ei);
        usedReq.add(bestIdx);
        pairs.push({ scanKey, endpoint: ep, request: reqs[bestIdx] });
      }
    }

    for (let ei = 0; ei < eps.length; ei++) {
      if (!usedEp.has(ei)) pairs.push({ scanKey, endpoint: eps[ei] });
    }
    for (let ri = 0; ri < reqs.length; ri++) {
      if (!usedReq.has(ri)) pairs.push({ scanKey, request: reqs[ri] });
    }
  }

  return pairs;
}

function tieBreakScore(ep: ApiEndpoint, req: CollectionRequestRef): number {
  let score = 0;
  const meta = req.draft.scan;
  if (meta?.sourceFile && ep.sourceFile && meta.sourceFile === ep.sourceFile) {
    score += 10;
  }
  if (meta?.handler && ep.handler && meta.handler === ep.handler) {
    score += 5;
  }
  if (meta?.framework && ep.framework && meta.framework === ep.framework) {
    score += 2;
  }
  return score;
}
