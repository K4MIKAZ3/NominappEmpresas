import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Nómina multi-empresa para Colombia",
  description:
    "Panel para dueños y contadores. Empresas, empleados y liquidación del período con parámetros legales versionados.",
};

const features = [
  {
    title: "Varias empresas",
    body: "Una cuenta para más de una razón social. Cada compañía queda aislada, con su propio equipo.",
  },
  {
    title: "Personas y contratos",
    body: "Cargo, tipo de contrato y salario mensual. El contador y el dueño trabajan sobre los mismos datos.",
  },
  {
    title: "Período de nómina",
    body: "Devengados, deducciones de ley y neto del mes, listos para revisar antes de cerrar el período.",
  },
];

const steps = [
  {
    n: "01",
    title: "Crea la cuenta",
    body: "El dueño o el contador entra con su correo. No hay otro acceso que configurar.",
  },
  {
    n: "02",
    title: "Registra la empresa",
    body: "Das de alta la compañía y las personas que vas a liquidar en ese período.",
  },
  {
    n: "03",
    title: "Revisa la liquidación",
    body: "Abres el mes, miras el desglose y cierras el período cuando los números cuadran.",
  },
];

export default function MarketingHomePage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="brand" style={{ color: "var(--ink)", padding: 0 }}>
          <div className="brand-mark" aria-hidden />
          nominapp
        </div>
        <nav className="actions" aria-label="Acciones">
          <a href="#precios" className="btn">
            Ver precios
          </a>
          <Link href="/login" className="btn">
            Entrar
          </Link>
          <Link href="/login?modo=registro" className="btn btn-primary">
            Empezar
          </Link>
        </nav>
      </header>

      <section className="landing-hero-plane" aria-labelledby="landing-title">
        <div className="landing-hero-glow" aria-hidden />
        <div className="landing-hero-inner">
          <p className="label-caps anim-rise">Colombia · panel empleador</p>
          <h1 id="landing-title" className="anim-rise delay-1">
            La nómina de tus empresas, en un solo lugar
          </h1>
          <p className="anim-rise delay-2">
            Para dueños y contadores. Registras las compañías, el equipo y el
            período. El cálculo usa parámetros laborales por vigencia, no una
            tabla pegada del año.
          </p>
          <div className="landing-cta anim-rise delay-3">
            <Link href="/login?modo=registro" className="btn btn-accent">
              Empezar
            </Link>
            <Link href="/login" className="btn">
              Entrar
            </Link>
            <a href="#precios" className="btn">
              Ver precios
            </a>
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="producto-title">
        <div className="landing-copy">
          <p className="label-caps">El panel</p>
          <h2 id="producto-title">Lo que puedes hacer hoy</h2>
          <p>
            Nominapp Empresas es el panel de nómina. La app del trabajador y la
            colilla llegan después; por ahora el trabajo está en liquidar desde
            aquí.
          </p>
        </div>
        <div className="landing-grid">
          {features.map((item) => (
            <article key={item.title} className="landing-card">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-section-ink" aria-labelledby="ley-title">
        <div className="landing-split">
          <div>
            <p className="label-caps">Ley laboral</p>
            <h2 id="ley-title">La norma cambia. El motor también.</h2>
          </div>
          <div>
            <p>
              Salario mínimo, auxilio de transporte, aportes y recargos viven
              como parámetros con fecha de vigencia. Cuando sale un decreto
              nuevo, se agrega el período que corresponde. No hace falta
              esperar un parche escondido en el código.
            </p>
            <ul className="landing-points">
              <li>Cada empresa ve solo su información.</li>
              <li>Dueño y contador comparten el panel, con roles distintos.</li>
              <li>El histórico del cálculo queda atado a la vigencia usada.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="pasos-title">
        <div className="landing-copy">
          <p className="label-caps">Cómo empieza</p>
          <h2 id="pasos-title">Tres pasos y ya estás liquidando</h2>
        </div>
        <ol className="landing-steps">
          {steps.map((step) => (
            <li key={step.n}>
              <span className="m">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section" id="precios" aria-labelledby="precios-title">
        <div className="landing-copy">
          <p className="label-caps">Precios</p>
          <h2 id="precios-title">Hoy el panel no se cobra</h2>
          <p>
            La suscripción aparece cuando exista la app del trabajador. Hasta
            ese día, crear una cuenta abre el panel sin mensualidad.
          </p>
        </div>
        <div className="price-grid">
          <article className="price-card price-card-current">
            <p className="label-caps">Ahora</p>
            <h3>Panel empleador</h3>
            <p className="price">
              <span className="m">$0</span>
              <small>al mes</small>
            </p>
            <p>Acceso anticipado, mientras armamos la app.</p>
            <ul>
              <li>Varias empresas en la misma cuenta</li>
              <li>Empleados, contratos y salarios</li>
              <li>Liquidación y cierre del período</li>
              <li>Parámetros legales por vigencia</li>
            </ul>
          </article>
          <article className="price-card">
            <p className="label-caps">Después</p>
            <h3>App del trabajador</h3>
            <p className="price">
              <span className="m">—</span>
              <small>se publica con la app</small>
            </p>
            <p>
              La colilla y la consulta del empleado entran con la aplicación.
              Esa tarifa se anuncia aquí el día del lanzamiento.
            </p>
          </article>
        </div>
      </section>

      <footer className="landing-foot">
        <span>Nominapp Empresas</span>
        <span>Nómina multi-empresa para Colombia</span>
      </footer>
    </div>
  );
}
