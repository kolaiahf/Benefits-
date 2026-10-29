import { useEffect, useState } from "react";
import { api } from "./api";

export function FinchCallback({ go }: { go: (path: string) => void }) {
  const [message, setMessage] = useState("Finishing the payroll connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const groupId = sessionStorage.getItem("finch_group");
    if (!code || !groupId) {
      setMessage("Finch did not return an authorization code.");
      return;
    }
    api.finchExchange(groupId, code)
      .then(() => api.finchSync(groupId))
      .then(() => go(`/groups/${groupId}`))
      .catch((caught: Error) => setMessage(caught.message));
  }, [go]);

  return (
    <div className="login-wrap">
      <div className="panel login-card">
        <p className="kicker">Finch</p>
        <h1>Payroll connection</h1>
        <p>{message}</p>
      </div>
    </div>
  );
}
