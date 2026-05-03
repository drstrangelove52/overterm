import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import useAuth from "../store/auth";
import Terminal from "../components/Terminal";
import SftpBrowser from "../components/SftpBrowser";

export default function HostDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") || "ssh";
  const { token } = useAuth();

  const handleClose = () => window.history.back();

  return (
    <div className="h-screen">
      {mode === "ssh" ? (
        <Terminal hostId={id} token={token} onClose={handleClose} />
      ) : (
        <SftpBrowser hostId={id} onClose={handleClose} />
      )}
    </div>
  );
}
