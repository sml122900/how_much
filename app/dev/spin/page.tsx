import { notFound } from "next/navigation";
import { SpinLab } from "./SpinLab";

// 프로덕션 빌드에서는 404. `next dev`(NODE_ENV=development)에서만 연다.
export default function DevSpinPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SpinLab />;
}
