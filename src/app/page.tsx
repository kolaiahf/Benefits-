import { requireUserId } from "@/lib/session";
import { getBootstrap } from "@/lib/bootstrap";
import BenefitsApp from "./BenefitsApp";

export default async function Page() {
  const userId = await requireUserId();
  const data = await getBootstrap(userId);
  return <BenefitsApp data={data} />;
}
