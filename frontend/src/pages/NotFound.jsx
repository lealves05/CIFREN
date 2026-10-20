import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui';

export default function NotFound() {
  return (
    <EmptyState icon={Compass} title="Página não encontrada" className="card"
      action={<Link to="/" className="btn-primary">Voltar ao início</Link>}>
      O endereço digitado não existe ou mudou de lugar.
    </EmptyState>
  );
}
