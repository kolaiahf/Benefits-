"use client";

import { useRouter } from "next/navigation";
import { Authed } from "../../components/Authed";
import { FinchCallback } from "../../../web/src/FinchCallback";

export default function FinchCallbackPage() {
  const router = useRouter();
  return (
    <Authed>
      <FinchCallback go={(path) => router.push(path)} />
    </Authed>
  );
}
