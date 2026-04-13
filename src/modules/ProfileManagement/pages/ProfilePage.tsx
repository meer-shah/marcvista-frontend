import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User as UserIcon, Camera, Save, Mail, Phone } from "lucide-react";
import { authService } from "@/lib/auth";
import type { User } from "@/lib/auth";
import { toast } from "sonner";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const ProfilePage = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    authService.getCurrentUser().then((user) => {
      if (user) {
        setCurrentUser(user);
        setName((user as any).name || "");
        setEmail((user as any).email || "");
        setPhone((user as any).phone || "");
        if ((user as any).profilePicture) {
          setAvatarPreview((user as any).profilePicture);
        }
      }
    });
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Fetch CSRF token before mutation
      const csrfRes = await fetch(`${API_BASE_URL}/api/auth/csrf-token`, { credentials: "include" });
      const { csrfToken } = await csrfRes.json();

      const response = await fetch(`${API_BASE_URL}/api/auth/profile`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ name, phone, profilePicture: avatarPreview }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to update profile");
      }

      const data = await response.json();
      const updatedUser = { ...data.user, profilePicture: avatarPreview };
      localStorage.setItem("markvista_user", JSON.stringify(updatedUser));
      window.dispatchEvent(new CustomEvent("userProfileUpdated", { detail: updatedUser }));
      toast.success("Profile updated successfully");
      navigate(-1);
    } catch (err: any) {
      toast.error(err.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const initials = name
    ? name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : email?.[0]?.toUpperCase() || "U";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Profile Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account information and preferences</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Avatar */}
        <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
          <CardHeader>
            <CardTitle className="text-base">Profile Picture</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              {/* Avatar preview */}
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden border-2 border-primary/30">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-primary">{initials}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-7 h-7 bg-primary rounded-full flex items-center justify-center hover:bg-primary/90 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5 text-black" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>
              <div>
                <p className="text-sm font-medium">{name || email}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Click the camera icon to upload a new photo
                </p>
                <p className="text-xs text-muted-foreground">Accepted: JPG, PNG, WebP — max 5MB</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account info */}
        <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
          <CardHeader>
            <CardTitle className="text-base">Account Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="flex items-center gap-2 text-sm">
                <UserIcon className="w-3.5 h-3.5 text-muted-foreground" /> Display Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="bg-background/20 border-white/10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2 text-sm">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" /> Email Address
              </Label>
              <Input
                id="email"
                value={email}
                disabled
                className="bg-background/10 border-white/5 text-muted-foreground cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground">Email cannot be changed</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2 text-sm">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" /> Phone Number
              </Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="bg-background/20 border-white/10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Save button */}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={saving}
            className="button-gradient text-black font-semibold px-8"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ProfilePage;
