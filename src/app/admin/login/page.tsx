import { Suspense } from "react";
import AdminLoginPage from "./ui";

export default function Page() {
  return (
    <Suspense>
      <AdminLoginPage />
    </Suspense>
  );
}
