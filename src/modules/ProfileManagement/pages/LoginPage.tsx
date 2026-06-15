import { useState, useEffect } from "react";
import { Mail, Lock } from "lucide-react";
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

const LoginPage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false
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
    setIsLoading(true);

    try {
      await authService.login(formData.email, formData.password);
      toast({
        title: "Login Successful",
        description: "Welcome back to Marcvista!",
      });
      navigate('/dashboard');
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid email or password",
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
        title="Welcome Back"
        subtitle="Sign in to your Marcvista account to continue trading"
      />

      <form onSubmit={handleSubmit}>
        <AuthCardContent className="space-y-4">
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
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            label="Password"
            icon={Lock}
            placeholder="Enter your password"
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

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <input
                id="rememberMe"
                name="rememberMe"
                type="checkbox"
                checked={formData.rememberMe}
                onChange={handleInputChange}
                className="w-4 h-4 rounded border-white/10 bg-background/50"
              />
              <Label htmlFor="rememberMe" className="text-sm text-muted-foreground">
                Remember me
              </Label>
            </div>
            <Link
              to="/forgot-password"
              className="text-sm text-primary hover:text-primary/80 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        </AuthCardContent>

        <AuthFormFooter
          submitLabel="Sign In"
          loadingLabel="Signing in..."
          loading={isLoading}
          altText="Don't have an account?"
          linkLabel="Sign up here"
          linkTo="/signup"
        />
      </form>
    </AuthLayout>
  );
};

export default LoginPage;
