import { Navigate, useLocation } from "react-router-dom";
import OTP from "./components/OtpForm";

type OtpLocationState = {
  email?: string;
  requestOtp?: boolean;
};

// Provides routing glue for OTP verification.
function OtpPage() {
  const location = useLocation();
  const state = (location.state as OtpLocationState | undefined) ?? {};

  if (!state.email) {
    return <Navigate to="/login" replace />;
  }

  return <OTP email={state.email} requestOnMount={state.requestOtp ?? true} />;
}

export default OtpPage;
