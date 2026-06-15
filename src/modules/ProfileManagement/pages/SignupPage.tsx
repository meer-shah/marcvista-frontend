import { useState, useEffect } from "react";
import { Mail, Lock, User, Phone } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { authService } from "@/lib/auth";
import {
  AuthLayout,
  AuthCardHeader,
  AuthCardContent,
  AuthFormField,
  AuthFormFooter,
  PasswordToggle,
} from "@/components/common";

const SignupPage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if already logged in
  useEffect(() => {
    if (authService.isAuthenticated()) {
      navigate('/dashboard');
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Passwords do not match. Please try again.",
        variant: "destructive"
      });
      return;
    }

    if (!formData.acceptTerms) {
      toast({
        title: "Terms Required",
        description: "Please accept the terms and conditions to continue.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      // Combine first and last name for the 'name' field
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();
      await authService.register(formData.email, formData.password, fullName, formData.phone);
      toast({
        title: "Account Created Successfully",
        description: "Welcome to Marcvista! You can now start trading.",
      });
      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: "Signup Failed",
        description: error.message || "Failed to create account",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <AuthLayout>
      <AuthCardHeader
        title="Create Account"
        subtitle="Join Marcvista and start your crypto trading journey"
      />

      <form onSubmit={handleSubmit}>
        <AuthCardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AuthFormField
              id="firstName"
              name="firstName"
              type="text"
              label="First Name"
              icon={User}
              placeholder="First name"
              value={formData.firstName}
              onChange={handleInputChange}
              required
            />

            <AuthFormField
              id="lastName"
              name="lastName"
              type="text"
              label="Last Name"
              placeholder="Last name"
              value={formData.lastName}
              onChange={handleInputChange}
              required
            />
          </div>

          <AuthFormField
            id="email"
            name="email"
            type="email"
            label="Email Address"
            icon={Mail}
            placeholder="Enter your email"
            value={formData.email}
            onChange={handleInputChange}
            required
          />

          <AuthFormField
            id="phone"
            name="phone"
            type="tel"
            label="Phone Number"
            icon={Phone}
            placeholder="Enter your phone number"
            value={formData.phone}
            onChange={handleInputChange}
            required
          />

          <div className="space-y-1">
            <AuthFormField
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              label="Password"
              icon={Lock}
              placeholder="Create a password"
              value={formData.password}
              onChange={handleInputChange}
              required
              endAdornment={
                <PasswordToggle
                  show={showPassword}
                  onToggle={() => setShowPassword(!showPassword)}
                />
              }
            />
            <p className="text-xs text-muted-foreground mt-1">
              Min 8 characters with at least one uppercase letter, lowercase letter, and digit.
            </p>
          </div>

          <AuthFormField
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirmPassword ? "text" : "password"}
            label="Confirm Password"
            icon={Lock}
            placeholder="Confirm your password"
            value={formData.confirmPassword}
            onChange={handleInputChange}
            required
            endAdornment={
              <PasswordToggle
                show={showConfirmPassword}
                onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
              />
            }
          />

          <div className="flex items-center space-x-2">
            <input
              id="acceptTerms"
              name="acceptTerms"
              type="checkbox"
              checked={formData.acceptTerms}
              onChange={handleInputChange}
              className="w-4 h-4 rounded border-white/10 bg-background/50"
              required
            />
            <Label htmlFor="acceptTerms" className="text-sm text-muted-foreground">
              I agree to the{" "}
              <Link to="/terms" className="text-primary hover:text-primary/80">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="text-primary hover:text-primary/80">
                Privacy Policy
              </Link>
            </Label>
          </div>
        </AuthCardContent>

        <AuthFormFooter
          submitLabel="Create Account"
          loadingLabel="Creating Account..."
          loading={isLoading}
          altText="Already have an account?"
          linkLabel="Sign in here"
          linkTo="/login"
        />
      </form>
    </AuthLayout>
  );
};

export default SignupPage;
