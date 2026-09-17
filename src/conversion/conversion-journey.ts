import { BadRequestException } from '@nestjs/common';

/** Validate before financial effects. Retain every recorded step and the current
 * node, including revisits. Legacy clients may still omit prior history. */
export function normalizeConversionJourney(payload: any): void {
  if (payload.visitorId && payload.ftVisitorId && payload.visitorId !== payload.ftVisitorId) {
    throw new BadRequestException('Conflicting visitor references');
  }
  const visitorId = payload.visitorId || payload.ftVisitorId;
  if (visitorId) { payload.visitorId = visitorId; payload.ftVisitorId = visitorId; }
  if (payload.nodePath != null && (typeof payload.nodePath !== 'string' || payload.nodePath.length > 16000)) {
    throw new BadRequestException('Invalid nodePath');
  }
  const nodes = String(payload.nodePath || '').split(',').map(node => node.trim()).filter(Boolean);
  if (nodes.some(node => !/^[A-Za-z0-9_-]{1,200}$/.test(node))) throw new BadRequestException('Invalid node in nodePath');
  const path = nodes.filter((node, index) => index === 0 || node !== nodes[index - 1]);
  const nodeId = payload.ftNodeId;
  if (typeof nodeId === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(nodeId) && path[path.length - 1] !== nodeId) path.push(nodeId);
  const normalized = path.join(',');
  if (normalized.length > 16000) throw new BadRequestException('Invalid nodePath');
  if (path.length) payload.nodePath = normalized;
}
