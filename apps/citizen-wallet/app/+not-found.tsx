import { useRouter } from "expo-router";

import { NotFoundScreen } from "../src/screens/NotFoundScreen.tsx";

export default function NotFound() {
  const router = useRouter();
  return <NotFoundScreen onHome={() => router.replace("/")} />;
}
