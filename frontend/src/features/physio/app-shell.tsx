import { Icon, type IconName } from "@/features/ui/icons";
import type { CustomExercise } from "./movement";

// The therapist's own exercise models, as the offline trainer reports them.
export function modelStat(customs: CustomExercise[]) {
  const count = (status: CustomExercise["status"]) =>
    customs.filter((c) => c.status === status).length;
  const ready = count("ready");
  const waiting = count("queued") + count("training");
  const failed = count("failed");
  if (!customs.length)
    return { value: "None", detail: "Add one in Add exercise" };
  return {
    value: String(ready),
    suffix: " ready",
    detail: waiting
      ? `${waiting} training now`
      : failed
        ? `${failed} failed, see Add exercise`
        : "All up to date",
  };
}

export function Stat({
  label,
  value,
  suffix,
  detail,
  color,
}: {
  label: string;
  value: string;
  suffix?: string;
  detail: string;
  color: string;
}) {
  return (
    <div className={"stat-card " + color}>
      <span className="stat-label">{label}</span>
      <div className="stat-value">
        {value}
        <span>{suffix}</span>
      </div>
      <span className="stat-detail">{detail}</span>
    </div>
  );
}
export function NavItem({
  icon,
  label,
  short,
  selected = false,
  count,
  onClick,
}: {
  icon: IconName;
  label: string;
  short: string;
  selected?: boolean;
  count?: number | string;
  onClick?: () => void;
}) {
  return (
    <button
      className={"nav-item" + (selected ? " selected" : "")}
      aria-current={selected ? "page" : undefined}
      onClick={onClick}
    >
      <Icon name={icon} />
      <span className="label-full">{label}</span>
      <span className="label-short" aria-hidden="true">
        {short}
      </span>
      {count !== undefined && <span className="nav-number">{count}</span>}
    </button>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
