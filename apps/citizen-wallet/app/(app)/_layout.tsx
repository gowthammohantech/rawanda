/** `(app)` stack behind the CTZ-02 session + consent guard. */
import { AppGuard } from "../../src/navigation/AppGuard.tsx";

export default function AppLayout() {
  return <AppGuard />;
}
