import { useState } from "react";
import { Mail, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  AuthLayout,
  AuthCardHeader,
  AuthCardContent,
  AuthFormField,
  AuthFormFooter,
} from "@/components/common";
import { CardFooter } from "@/components/ui/card";

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate email sending process
    setTimeout(() => {
      setIsLoading(false);
      setIsEmailSent(true);
      toast({
        title: "Reset Email Sent",
        description: "Check your email for password reset instructions.",
      });
    }, 2000);
  };

  if (isEmailSent) {
    return (
      <AuthLayout>
        <AuthCardHeader
          title="Check Your Email"
          subtitle={
            <>
              We've sent password reset instructions to <br />
              <span className="text-primary font-medium">{email}</span>
            </>
          }
        />

        <div className="-mt-2 mb-2 flex justify-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-primary" />
          </div>
        </div>

        <AuthCardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Didn't receive the email? Check your spam folder or{" "}
            <button
              onClick={() => setIsEmailSent(false)}
              className="text-primary hover:text-primary/80 underline"
            >
              try again
            </button>
          </p>
        </AuthCardContent>

        <CardFooter className="flex flex-col space-y-4">
          <Link to="/login" className="w-full">
            <Button className="w-full button-gradient">
              Back to Sign In
            </Button>
          </Link>
        </CardFooter>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthCardHeader
        title="Forgot Password?"
        subtitle="No worries! Enter your email address and we'll send you a link to reset your password."
      />

      <form onSubmit={handleSubmit}>
        <AuthCardContent className="space-y-4">
          <AuthFormField
            id="email"
            name="email"
            type="email"
            label="Email Address"
            icon={Mail}
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </AuthCardContent>

        <AuthFormFooter
          submitLabel="Send Reset Email"
          loadingLabel="Sending Reset Email..."
          loading={isLoading}
          altText="Remember your password?"
          linkLabel="Back to Sign In"
          linkTo="/login"
        />
      </form>
    </AuthLayout>
  );
};

export default ForgotPasswordPage;
