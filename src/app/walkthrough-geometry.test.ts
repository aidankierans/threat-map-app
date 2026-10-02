import { expect, it } from "vitest";
import { guideArrow } from "./walkthrough-geometry.js";

it.each([
  { left: 0, top: 100, width: 100, height: 40 },
  { left: 500, top: 100, width: 100, height: 40 },
  { left: 250, top: 0, width: 100, height: 40 },
  { left: 250, top: 400, width: 100, height: 40 },
])("keeps the arrowhead outside a target above, below or beside the guide: %j", target => {
  const card = { left: 200, top: 100, width: 200, height: 200 };
  const line = guideArrow(card, target)!;
  expect(line).not.toBeNull();
  const horizontalGap = Math.max(target.left - line.x2, 0, line.x2 - target.left - target.width);
  const verticalGap = Math.max(target.top - line.y2, 0, line.y2 - target.top - target.height);
  expect(Math.hypot(horizontalGap, verticalGap)).toBeGreaterThan(5);
  expect(line.x1 === card.left || line.x1 === card.left + card.width || line.y1 === card.top || line.y1 === card.top + card.height).toBe(true);
});
it("omits an arrow when the target overlaps the guide", () => {
  expect(guideArrow({ left: 0, top: 0, width: 300, height: 300 }, { left: 100, top: 100, width: 30, height: 30 })).toBeNull();
});
