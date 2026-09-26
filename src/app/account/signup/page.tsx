import Page from "@/components/Page";
import SignupForm from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <Page narrow title="Create an account">
      <SignupForm />
    </Page>
  );
}
