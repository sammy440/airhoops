"use client";

import type { Ref } from "react";
import type { HandChoice, KinematicsFrame } from "@/lib/pose/kinematics";
import { Panel, Segmented, Stat } from "./Controls";
import { SpeedGraph, type SpeedGraphHandle } from "./SpeedGraph";

const HANDS: { value: HandChoice; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

const fmt = (v: number | undefined, dp = 1) => (v === undefined ? "–" : v.toFixed(dp));

export function KinematicsPanel({
  kin,
  peak,
  hand,
  onHandChange,
  graphRef,
}: {
  kin: KinematicsFrame | null;
  peak: number;
  hand: HandChoice;
  onHandChange: (h: HandChoice) => void;
  graphRef: Ref<SpeedGraphHandle>;
}) {
  const arm = kin?.arms[kin.hand] ?? undefined;
  const speedTone = !arm ? "default" : arm.speed > 3 ? "bad" : arm.speed > 1.5 ? "warn" : "default";

  return (
    <Panel
      title="Motion"
      aside={
        <span className="font-mono text-[11px] text-muted">
          {kin ? `${kin.hand} hand${hand === "auto" ? " · auto" : ""}` : "no arm in view"}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Wrist speed" value={fmt(arm?.speed)} unit="torso/s" tone={speedTone} />
        <Stat label="Peak (1.5s)" value={arm ? peak.toFixed(1) : "–"} unit="torso/s" />
        <Stat label="Angle" value={fmt(arm?.angle, 0)} unit="°" />
        <Stat label="Extension" value={fmt(arm?.extension, 2)} unit="×torso" />
        <Stat label="Elbow" value={fmt(arm?.elbowAngle, 0)} unit="°" />
      </div>

      <div className="mt-3 rounded-xl bg-white/[0.03] p-2">
        <SpeedGraph ref={graphRef} />
        <div className="mt-1 flex items-center gap-4 px-1 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-hoop" /> Throwing hand
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded bg-white/30" /> Other hand
          </span>
          <span className="ml-auto">torso lengths / second</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted">Throwing hand</span>
        <div className="w-56">
          <Segmented value={hand} options={HANDS} onChange={onHandChange} />
        </div>
      </div>
    </Panel>
  );
}
