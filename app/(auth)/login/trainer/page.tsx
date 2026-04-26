import { redirect } from "next/navigation";

export default function TrainerLoginRedirect() {
  redirect("/login");
}
