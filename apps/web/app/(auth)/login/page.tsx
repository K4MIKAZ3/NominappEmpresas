import { LoginForm } from "./login-form";

export const metadata = {
  title: "Entrar",
};

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { modo?: string };
}) {
  const registro = searchParams?.modo === "registro";

  return (
    <div className="auth-wrap">
      <div className="auth-panel">
        <div className="brand" style={{ color: "var(--ink)", padding: 0 }}>
          <div className="brand-mark" aria-hidden />
          nominapp
        </div>
        <h1>{registro ? "Empezar" : "Entrar"}</h1>
        <p className="muted" style={{ margin: "0 0 1.25rem", lineHeight: 1.5 }}>
          {registro ? "Crea la cuenta de tu empresa." : "Accede a tu panel de nómina."}
        </p>
        <LoginForm initialMode={registro ? "signup" : "signin"} />
      </div>
    </div>
  );
}
