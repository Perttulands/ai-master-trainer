import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  LayoutDashboard,
  ArrowRight
} from "lucide-react";
import { Button } from "../ui";
import { TutorialDemo } from "./TutorialDemo";

interface LandingPageProps {
  onViewDashboard?: () => void;
}

export function LandingPage({ onViewDashboard }: LandingPageProps) {
  const navigate = useNavigate();

  const handleGoToTool = () => {
    if (onViewDashboard) {
      onViewDashboard();
    } else {
      navigate("/new");
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-3xl w-full text-center space-y-8">
        {/* Hero Section */}
        <div className="space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-primary-100 rounded-2xl mb-4">
            <Sparkles className="w-8 h-8 text-primary-600" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 tracking-tight">
            Evolve Your AI Agents
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Training Camp uses evolutionary algorithms to optimize your AI
            prompts and strategies. Watch them compete, learn, and improve in
            real-time.
          </p>

          <div className="pt-6">
            <Button
              size="lg"
              onClick={handleGoToTool}
              className="text-lg px-8 py-6 shadow-lg hover:shadow-xl transition-all gap-2"
            >
              <LayoutDashboard className="w-5 h-5" />
              Go to Tool
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Tutorial Section */}
        <div className="pt-8">
          <TutorialDemo onComplete={handleGoToTool} />
        </div>

        {/* Philosophy Section */}
        <div className="max-w-2xl mx-auto pt-12 pb-8 text-left space-y-8">
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900">Why Training Camp?</h2>
            <p className="text-gray-600 leading-relaxed">
              Creating the perfect AI agent is hard. You often don't know exactly what prompt or strategy will work best until you see the results. Training Camp solves this by treating agent creation as an evolutionary process.
            </p>
          </div>

          <div className="grid gap-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <span className="text-xl">🤖</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Master Trainer as Co-Pilot</h3>
                <p className="text-sm text-gray-600">
                  You don't need to be a prompt engineering expert. The Master Trainer acts as your partner, analyzing your needs and proposing diverse strategies you might not have thought of.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <span className="text-xl">🌱</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Iterative Evolution</h3>
                <p className="text-sm text-gray-600">
                  Start with a rough idea and refine it through feedback. Score the outputs, give directives, and watch as the system evolves better agents that align with your specific requirements.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <span className="text-xl">🎯</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Real Results</h3>
                <p className="text-sm text-gray-600">
                  No fake data or simulations. Every agent execution is real, allowing you to build reliable, production-ready prompts and configurations.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 pt-8 text-left">
          <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
            <div className="font-semibold text-gray-900 mb-2">
              🧬 Evolutionary
            </div>
            <p className="text-sm text-gray-500">
              Agents compete and evolve based on your feedback and scoring.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
            <div className="font-semibold text-gray-900 mb-2">
              🔍 Transparent
            </div>
            <p className="text-sm text-gray-500">
              See exactly how prompts change and why improvements happen.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-white border border-gray-100 shadow-sm">
            <div className="font-semibold text-gray-900 mb-2">
              ⚡️ Fast Iteration
            </div>
            <p className="text-sm text-gray-500">
              Rapidly test multiple strategies in parallel to find the best fit.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
