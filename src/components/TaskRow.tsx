import { useRef, useState } from "react";
import {
  motion,
  useDragControls,
  useMotionValue,
  useTransform,
  useReducedMotion,
} from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHalf,
  DotsThree,
} from "@phosphor-icons/react";
import {
  labels,
  moveStatus,
  type LocalTask,
  type Status,
} from "../../shared/model";
export function TaskRow({
  task,
  onStatus,
  onEdit,
}: {
  task: LocalTask;
  onStatus: (status: Status) => void;
  onEdit: () => void;
}) {
  const controls = useDragControls(),
    x = useMotionValue(0),
    right = useTransform(x, [0, 64], [0, 1]),
    left = useTransform(x, [-64, 0], [1, 0]),
    reveal = useTransform(x, [-64, 0, 64], [1, 0, 1]),
    [dragging, setDragging] = useState(false),
    lastDrag = useRef(0),
    reduced = useReducedMotion();
  return (
    <motion.li
      layout={!reduced}
      initial={{ opacity: 0, y: reduced ? 0 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
      transition={{ type: "spring", stiffness: 430, damping: 35 }}
      className={`task-wrap ${task.status}`}
    >
      <motion.div
        className="swipe-underlay"
        style={{ opacity: reveal }}
        aria-hidden="true"
      >
        <motion.span style={{ opacity: right }}>
          <ArrowRight size={24} />
          {labels[moveStatus(task.status, 1)]}
        </motion.span>
        <motion.span style={{ opacity: left }}>
          {labels[moveStatus(task.status, -1)]}
          <ArrowLeft size={24} />
        </motion.span>
      </motion.div>
      <motion.article
        className="task-row glass"
        data-testid="task-row"
        style={{ x, touchAction: "pan-y" }}
        drag="x"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.85}
        onPointerDown={(e) => {
          if (!(e.target as HTMLElement).closest("button")) controls.start(e);
        }}
        onDragStart={() => setDragging(true)}
        onDragEnd={(_, info) => {
          setDragging(false);
          lastDrag.current = Date.now();
          if (
            Math.abs(info.offset.x) > 64 ||
            (Math.abs(info.velocity.x) > 600 && Math.abs(info.offset.x) > 24)
          ) {
            const status = moveStatus(task.status, info.offset.x > 0 ? 1 : -1);
            if (status !== task.status) {
              onStatus(status);
              navigator.vibrate?.(12);
            }
          }
        }}
      >
        <button
          className={`status-button ${task.status}`}
          aria-label={`${task.text}：${labels[task.status]}。状態を変更`}
          onClick={onEdit}
        >
          {task.status === "done" ? (
            <Check size={20} weight="bold" />
          ) : task.status === "doing" ? (
            <CircleHalf size={24} weight="fill" />
          ) : (
            <span />
          )}
        </button>
        <div
          className="task-copy"
          onClick={() => {
            if (!dragging && Date.now() - lastDrag.current > 200) onEdit();
          }}
        >
          <p>{task.text}</p>
          <span className="status-label">{labels[task.status]}</span>
        </div>
        <button
          className="icon-button more"
          aria-label={`${task.text}を編集`}
          onClick={onEdit}
        >
          <DotsThree size={25} weight="bold" />
        </button>
      </motion.article>
    </motion.li>
  );
}
