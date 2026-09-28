import { Suspense } from "react";
import ClientLoginForm from "./ui";

export default function Page() {
  return (
    <Suspense>
      <ClientLoginForm />
    </Suspense>
  );
}
