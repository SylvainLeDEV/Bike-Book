import { ToastProvider } from "@/components/ui/toast";
import { requireAccessContext } from "@/server/auth/context";
import { getThemePreference } from "@/server/theme";
import { getAppFrameVM } from "@/server/views/shell";
import { AppFrame } from "./app-frame";

/** Signed-in pages: the app shell (D-30), fed with the current user's workspace. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await requireAccessContext();
  const theme = await getThemePreference();
  return (
    <ToastProvider>
      <AppFrame frame={getAppFrameVM(context)} theme={theme}>
        {children}
      </AppFrame>
    </ToastProvider>
  );
}
