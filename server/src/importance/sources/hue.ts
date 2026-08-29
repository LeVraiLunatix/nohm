import type { HueData } from '@nohm/shared';

import type { Candidate } from '../types.js';

export function hueCandidates(data: HueData | undefined): Candidate[] {
  const onLights = data?.lights.filter((light) => light.on) ?? [];
  if (!onLights.length) return [];
  const onRooms = data?.rooms.filter((room) => room.anyOn).map((room) => room.name) ?? [];
  return [{
    id: 'hue:lights-on', source: 'hue', kind: 'hue', score: 24, shapes: ['tile'],
    kicker: 'Lights on', title: `${onLights.length} light${onLights.length === 1 ? '' : 's'} active`,
    detail: onRooms.slice(0, 2).join(' · ') || 'Open lights controls', href: '#/personal/hue', render: { type: 'text' },
  }];
}
