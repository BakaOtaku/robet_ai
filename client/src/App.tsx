import { Hero } from './components/Hero';
import { Problems } from './components/Problems';
import { Solutions } from './components/Solutions';
import { Architecture } from './components/Architecture';
import { Revenue } from './components/Revenue';
import { Footer } from './components/Footer';

function App() {
  return (
    <div className="min-h-screen bg-white">
      <Hero />
      <Problems />
      <Solutions />
      <Architecture />
      <Revenue />
      <Footer />
    </div>
  );
}

export default App;