import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform, useInView, AnimatePresence, Variants } from 'framer-motion'
import {
  Zap,
  MessageSquare,
  ArrowRight,
  Shield,
  Bot,
  Clock,
  Target,
  Sparkles,
  ChevronDown,
  Activity,
  Globe,
  BarChart3,
  Wallet,
  Check,
  Play,
  Star,
  Users,
  Brain,
  Boxes,
  ArrowUpRight,
  MousePointer,
  Terminal,
  CircleDot,
  X,
} from 'lucide-react'

// Animation variants
const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.8 }
  }
}

const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -40 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.8 }
  }
}

const fadeInRight: Variants = {
  hidden: { opacity: 0, x: 40 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: 0.8 }
  }
}

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2
    }
  }
}

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.6 }
  }
}

// Floating particles component
function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-indigo-400/30 rounded-full"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -30, 0],
            x: [0, Math.random() * 20 - 10, 0],
            opacity: [0.3, 0.8, 0.3],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: 3 + Math.random() * 4,
            repeat: Infinity,
            delay: Math.random() * 2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  )
}

// Animated grid background
function GridBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.1)_0%,transparent_70%)]"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  )
}

// Animated orb component
function GlowingOrb({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  return (
    <motion.div
      className={`absolute rounded-full blur-3xl ${className}`}
      animate={{
        scale: [1, 1.2, 1],
        opacity: [0.3, 0.6, 0.3],
      }}
      transition={{
        duration: 6,
        repeat: Infinity,
        delay,
        ease: "easeInOut",
      }}
    />
  )
}

// Stats counter component
function StatCounter({ value, suffix = "", label }: { value: number; suffix?: string; label: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (isInView) {
      let start = 0
      const duration = 2000
      const increment = value / (duration / 16)
      const timer = setInterval(() => {
        start += increment
        if (start >= value) {
          setCount(value)
          clearInterval(timer)
        } else {
          setCount(Math.floor(start))
        }
      }, 16)
      return () => clearInterval(timer)
    }
  }, [isInView, value])

  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl md:text-5xl font-bold text-white mb-2">
        {count.toLocaleString()}{suffix}
      </div>
      <div className="text-gray-400 text-sm uppercase tracking-wider">{label}</div>
    </div>
  )
}

// Typing effect component
function TypeWriter({ text, delay = 0 }: { text: string; delay?: number }) {
  const [displayText, setDisplayText] = useState("")
  
  useEffect(() => {
    const timer = setTimeout(() => {
      let i = 0
      const interval = setInterval(() => {
        if (i < text.length) {
          setDisplayText(text.slice(0, i + 1))
          i++
        } else {
          clearInterval(interval)
        }
      }, 50)
      return () => clearInterval(interval)
    }, delay)
    return () => clearTimeout(timer)
  }, [text, delay])

  return (
    <span>
      {displayText}
      <motion.span
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.8, repeat: Infinity }}
        className="text-indigo-400"
      >
        |
      </motion.span>
    </span>
  )
}

// Feature card component
function FeatureCard({ 
  icon: Icon, 
  title, 
  description, 
  gradient 
}: { 
  icon: any; 
  title: string; 
  description: string;
  gradient: string;
}) {
  return (
    <motion.div
      variants={fadeInUp}
      whileHover={{ y: -8, scale: 1.02 }}
      className="relative group"
    >
      <div className={`absolute inset-0 ${gradient} rounded-3xl blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-500`} />
      <div className="relative h-full bg-gray-900/60 backdrop-blur-xl border border-gray-700/30 rounded-3xl p-8 overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-bl-full" />
        <div className={`inline-flex p-4 rounded-2xl ${gradient} mb-6`}>
          <Icon className="h-7 w-7 text-white" />
        </div>
        <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
        <p className="text-gray-400 leading-relaxed">{description}</p>
        <motion.div 
          className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"
          whileHover={{ x: 5 }}
        >
          <ArrowUpRight className="h-5 w-5 text-indigo-400" />
        </motion.div>
      </div>
    </motion.div>
  )
}

// Step card component
function StepCard({ 
  number, 
  title, 
  description, 
  icon: Icon,
  delay 
}: { 
  number: string;
  title: string; 
  description: string;
  icon: any;
  delay: number;
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={{
        hidden: { opacity: 0, y: 50 },
        visible: { 
          opacity: 1, 
          y: 0,
          transition: { duration: 0.6, delay }
        }
      }}
      className="relative"
    >
      {/* Connector line */}
      <div className="hidden md:block absolute top-16 left-1/2 w-full h-0.5 bg-gradient-to-r from-indigo-500/50 via-purple-500/30 to-transparent -z-10" />
      
      <div className="relative group">
        <motion.div 
          className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-purple-600/20 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          whileHover={{ scale: 1.05 }}
        />
        <div className="relative bg-gray-900/70 backdrop-blur-xl border border-gray-700/40 rounded-3xl p-8 text-center hover:border-indigo-500/30 transition-colors duration-300">
          <motion.div 
            className="w-16 h-16 mx-auto mb-6 relative"
            whileHover={{ rotate: 10, scale: 1.1 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl opacity-20 blur-lg" />
            <div className="relative w-full h-full bg-gradient-to-br from-indigo-500/20 to-purple-600/20 rounded-2xl border border-indigo-500/30 flex items-center justify-center">
              <Icon className="h-8 w-8 text-indigo-400" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-indigo-500/50">
              {number}
            </div>
          </motion.div>
          <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
          <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
        </div>
      </div>
    </motion.div>
  )
}

// Testimonial card
function TestimonialCard({ quote, author, role, avatar }: { quote: string; author: string; role: string; avatar: string }) {
  return (
    <motion.div
      variants={scaleIn}
      whileHover={{ y: -5 }}
      className="bg-gray-900/50 backdrop-blur-xl border border-gray-700/30 rounded-2xl p-6"
    >
      <div className="flex items-center gap-1 mb-4">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
        ))}
      </div>
      <p className="text-gray-300 mb-6 italic">"{quote}"</p>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
          {avatar}
        </div>
        <div>
          <div className="font-semibold text-white">{author}</div>
          <div className="text-sm text-gray-400">{role}</div>
        </div>
      </div>
    </motion.div>
  )
}

// Main Landing component
export default function Landing() {
  const { scrollYProgress } = useScroll()
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0])
  const heroScale = useTransform(scrollYProgress, [0, 0.2], [1, 0.95])
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const features = [
    {
      icon: Brain,
      title: "AI-Powered Trading",
      description: "Leverage advanced language models to create, manage, and execute trading strategies using simple natural language commands.",
      gradient: "bg-gradient-to-br from-indigo-500/20 to-purple-600/20"
    },
    {
      icon: Clock,
      title: "24/7 Automation",
      description: "Your trading rules work around the clock, monitoring markets and executing trades even while you sleep.",
      gradient: "bg-gradient-to-br from-emerald-500/20 to-teal-600/20"
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "Bank-grade encryption, secure wallet connections, and multi-layer authentication to protect your assets.",
      gradient: "bg-gradient-to-br from-amber-500/20 to-orange-600/20"
    },
    {
      icon: BarChart3,
      title: "Real-Time Analytics",
      description: "Live market data, comprehensive charts, and detailed performance metrics at your fingertips.",
      gradient: "bg-gradient-to-br from-cyan-500/20 to-blue-600/20"
    },
    {
      icon: Globe,
      title: "Multi-Market Support",
      description: "Trade across perpetual futures, spot markets, and more with unified interface and seamless execution.",
      gradient: "bg-gradient-to-br from-rose-500/20 to-pink-600/20"
    },
    {
      icon: Boxes,
      title: "Drift Protocol Integration",
      description: "Direct integration with Drift Protocol for institutional-grade perpetual futures trading on Solana.",
      gradient: "bg-gradient-to-br from-violet-500/20 to-indigo-600/20"
    }
  ]

  const steps = [
    {
      number: "1",
      icon: Wallet,
      title: "Connect Wallet",
      description: "Securely connect your Solana wallet to begin trading on the platform."
    },
    {
      number: "2",
      icon: MessageSquare,
      title: "Describe Your Strategy",
      description: "Use natural language to tell the AI what trading rules you want to create."
    },
    {
      number: "3",
      icon: Bot,
      title: "AI Creates Rules",
      description: "Our AI instantly parses your intent and creates precise trading parameters."
    },
    {
      number: "4",
      icon: Activity,
      title: "Automated Execution",
      description: "Rules are monitored 24/7 and trades execute automatically when conditions are met."
    }
  ]

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Navigation */}
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="fixed top-0 left-0 right-0 z-50 px-4 py-4"
      >
        <div className="max-w-7xl mx-auto">
          <div className="bg-gray-900/70 backdrop-blur-xl border border-gray-700/30 rounded-2xl px-6 py-3">
            <div className="flex items-center justify-between">
              <Link to="/" className="flex items-center gap-3 group">
                <motion.div 
                  className="relative p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-600/20 rounded-xl border border-indigo-500/20"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                >
                  <Zap className="h-6 w-6 text-indigo-400" />
                </motion.div>
                <span className="text-xl font-bold tracking-tight text-white">
                  Sol<span className="text-indigo-400">Trader</span>
                </span>
              </Link>

              {/* Desktop Nav */}
              <div className="hidden md:flex items-center gap-8">
                <a href="#features" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">Features</a>
                <a href="#how-it-works" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">How it Works</a>
                <a href="#testimonials" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">Testimonials</a>
              </div>

              <div className="flex items-center gap-3">
                <Link 
                  to="/dashboard"
                  className="hidden md:block text-sm text-gray-400 hover:text-white transition-colors font-medium"
                >
                  Dashboard
                </Link>
                <Link 
                  to="/chat"
                  className="group relative px-6 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl text-white font-semibold text-sm overflow-hidden"
                >
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-indigo-400 to-purple-500"
                    initial={{ x: "100%" }}
                    whileHover={{ x: 0 }}
                    transition={{ duration: 0.3 }}
                  />
                  <span className="relative flex items-center gap-2">
                    Launch App
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                </Link>

                {/* Mobile menu button */}
                <button 
                  className="md:hidden p-2 text-gray-400 hover:text-white"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                  {isMenuOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 left-4 right-4 z-40 bg-gray-900/95 backdrop-blur-xl border border-gray-700/30 rounded-2xl p-6 md:hidden"
          >
            <div className="flex flex-col gap-4">
              <a href="#features" className="text-gray-300 hover:text-white py-2">Features</a>
              <a href="#how-it-works" className="text-gray-300 hover:text-white py-2">How it Works</a>
              <a href="#testimonials" className="text-gray-300 hover:text-white py-2">Testimonials</a>
              <Link to="/dashboard" className="text-gray-300 hover:text-white py-2">Dashboard</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <motion.section 
        style={{ opacity: heroOpacity, scale: heroScale }}
        className="relative min-h-screen flex items-center justify-center pt-32 pb-20 px-4"
      >
        <GridBackground />
        <FloatingParticles />
        <GlowingOrb className="w-[600px] h-[600px] bg-indigo-500/20 -top-40 -left-40" delay={0} />
        <GlowingOrb className="w-[500px] h-[500px] bg-purple-500/20 -bottom-40 -right-40" delay={2} />
        <GlowingOrb className="w-[400px] h-[400px] bg-cyan-500/10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" delay={4} />

        <div className="relative max-w-6xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            {/* Badge */}
            <motion.div 
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full mb-8"
              whileHover={{ scale: 1.05 }}
            >
              <CircleDot className="h-4 w-4 text-indigo-400 animate-pulse" />
              <span className="text-sm text-indigo-300 font-medium">Built on Solana • Powered by AI</span>
            </motion.div>

            {/* Main headline */}
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-white mb-6 leading-tight tracking-tight">
              <span className="block">Trade Crypto with</span>
              <span className="relative inline-block">
                <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  Natural Language
                </span>
                <motion.div
                  className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 1, delay: 0.5 }}
                />
              </span>
            </h1>

            <motion.p 
              className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto mb-10 leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Create automated trading rules, monitor markets, and execute strategies — 
              just by chatting with our AI assistant.
            </motion.p>

            {/* CTA buttons */}
            <motion.div 
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Link 
                to="/chat"
                className="group relative px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl text-white font-semibold text-lg overflow-hidden shadow-2xl shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-shadow"
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-indigo-400 to-purple-500"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: 0 }}
                  transition={{ duration: 0.3 }}
                />
                <span className="relative flex items-center gap-3">
                  <MessageSquare className="h-5 w-5" />
                  Start Trading Now
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-2 transition-transform" />
                </span>
              </Link>
              <Link 
                to="/dashboard"
                className="group px-8 py-4 bg-gray-800/50 hover:bg-gray-800/70 border border-gray-700/50 hover:border-gray-600/50 rounded-2xl text-white font-semibold text-lg transition-all"
              >
                <span className="flex items-center gap-3">
                  <Play className="h-5 w-5 text-indigo-400" />
                  View Dashboard
                </span>
              </Link>
            </motion.div>

            {/* Demo terminal */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.8 }}
              className="relative max-w-3xl mx-auto"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-3xl blur-2xl" />
              <div className="relative bg-gray-900/80 backdrop-blur-xl border border-gray-700/50 rounded-3xl overflow-hidden shadow-2xl">
                {/* Terminal header */}
                <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-700/50 bg-gray-800/50">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  </div>
                  <div className="flex-1 text-center">
                    <span className="text-xs text-gray-500 font-medium">SolTrader AI Assistant</span>
                  </div>
                  <Terminal className="h-4 w-4 text-gray-500" />
                </div>
                {/* Terminal content */}
                <div className="p-8 space-y-6 font-mono text-sm">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                      <MousePointer className="h-4 w-4 text-indigo-400" />
                    </div>
                    <div className="flex-1 bg-gray-800/50 rounded-2xl rounded-tl-none px-5 py-4">
                      <TypeWriter text="Buy $500 of SOL when it drops below $80" delay={1000} />
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-emerald-400" />
                    </div>
                    <motion.div 
                      className="flex-1 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl rounded-tl-none px-5 py-4"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 3 }}
                    >
                      <div className="flex items-center gap-2 text-emerald-400 mb-2">
                        <Check className="h-4 w-4" />
                        <span className="font-semibold">Trading Rule Created</span>
                      </div>
                      <div className="text-gray-400 space-y-1">
                        <div><span className="text-gray-500">Asset:</span> SOL-PERP</div>
                        <div><span className="text-gray-500">Action:</span> Buy $500</div>
                        <div><span className="text-gray-500">Trigger:</span> Price &lt; $80.00</div>
                        <div><span className="text-gray-500">Status:</span> <span className="text-emerald-400">Active ●</span></div>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div 
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <ChevronDown className="h-8 w-8 text-gray-500" />
          </motion.div>
        </div>
      </motion.section>

      {/* Stats Section */}
      <section className="relative py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12"
          >
            <motion.div variants={fadeInUp}>
              <StatCounter value={50000} suffix="+" label="Trades Executed" />
            </motion.div>
            <motion.div variants={fadeInUp}>
              <StatCounter value={12000} suffix="+" label="Active Users" />
            </motion.div>
            <motion.div variants={fadeInUp}>
              <StatCounter value={99} suffix="%" label="Uptime" />
            </motion.div>
            <motion.div variants={fadeInUp}>
              <StatCounter value={24} suffix="/7" label="Monitoring" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative py-32 px-4">
        <GlowingOrb className="w-[500px] h-[500px] bg-purple-500/10 top-0 right-0" delay={1} />
        
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="text-center mb-20"
          >
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full mb-6">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <span className="text-sm text-indigo-300 font-medium">Powerful Features</span>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-4xl md:text-5xl font-bold text-white mb-6">
              Everything You Need to
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent"> Trade Smarter</span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-xl text-gray-400 max-w-2xl mx-auto">
              Professional-grade trading tools powered by AI, accessible through natural conversation.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {features.map((feature, index) => (
              <FeatureCard key={index} {...feature} />
            ))}
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="relative py-32 px-4 overflow-hidden">
        <GridBackground />
        <GlowingOrb className="w-[600px] h-[600px] bg-indigo-500/10 -left-48 top-1/2 -translate-y-1/2" delay={2} />
        
        <div className="relative max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="text-center mb-20"
          >
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-6">
              <Target className="h-4 w-4 text-emerald-400" />
              <span className="text-sm text-emerald-300 font-medium">Simple Process</span>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-4xl md:text-5xl font-bold text-white mb-6">
              Start Trading in
              <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent"> 4 Simple Steps</span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-xl text-gray-400 max-w-2xl mx-auto">
              From connection to execution, our platform makes automated trading accessible to everyone.
            </motion.p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <StepCard 
                key={index} 
                {...step} 
                delay={index * 0.15}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Chat Demo Section */}
      <section className="relative py-32 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInLeft}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-full mb-6">
                <Bot className="h-4 w-4 text-purple-400" />
                <span className="text-sm text-purple-300 font-medium">AI Chat Interface</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                Just <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Chat</span> to Trade
              </h2>
              <p className="text-xl text-gray-400 mb-8 leading-relaxed">
                No complex interfaces or technical jargon. Simply describe what you want in plain English, 
                and our AI handles the rest.
              </p>
              <ul className="space-y-4 mb-10">
                {[
                  "Create trading rules with natural language",
                  "Get real-time price updates instantly",
                  "Analyze your portfolio performance",
                  "Modify or cancel rules with simple commands"
                ].map((item, i) => (
                  <motion.li 
                    key={i}
                    className="flex items-center gap-3 text-gray-300"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <Check className="h-3.5 w-3.5 text-purple-400" />
                    </div>
                    {item}
                  </motion.li>
                ))}
              </ul>
              <Link 
                to="/chat"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-white font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-shadow"
              >
                Try Chat Now
                <ArrowRight className="h-5 w-5" />
              </Link>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeInRight}
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-3xl blur-3xl" />
              <div className="relative bg-gray-900/80 backdrop-blur-xl border border-gray-700/50 rounded-3xl p-6 shadow-2xl">
                <div className="space-y-4">
                  {/* Example conversations */}
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm flex-shrink-0">U</div>
                    <div className="bg-gray-800/50 rounded-2xl rounded-tl-none px-4 py-3 text-gray-300 text-sm">
                      What's the current price of BTC and ETH?
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/30 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-indigo-400" />
                    </div>
                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl rounded-tl-none px-4 py-3 text-gray-300 text-sm">
                      <div className="flex items-center gap-4 mb-2">
                        <span className="text-white font-semibold">BTC: $67,245.30</span>
                        <span className="text-emerald-400 text-xs">+2.4%</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-white font-semibold">ETH: $3,521.18</span>
                        <span className="text-emerald-400 text-xs">+1.8%</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm flex-shrink-0">U</div>
                    <div className="bg-gray-800/50 rounded-2xl rounded-tl-none px-4 py-3 text-gray-300 text-sm">
                      Set up a rule to buy $200 ETH if it drops below $3,400
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/30 flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-indigo-400" />
                    </div>
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl rounded-tl-none px-4 py-3 text-sm">
                      <div className="flex items-center gap-2 text-emerald-400 font-medium mb-1">
                        <Check className="h-4 w-4" />
                        Rule Created Successfully!
                      </div>
                      <div className="text-gray-400 text-xs">
                        Will buy $200 of ETH-PERP when price drops below $3,400
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-gray-700/50">
                  <div className="flex items-center gap-3">
                    <input 
                      type="text" 
                      placeholder="Type your trading command..." 
                      className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded-xl px-4 py-3 text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:border-indigo-500/50"
                    />
                    <motion.button 
                      className="p-3 bg-indigo-500 rounded-xl text-white"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <ArrowRight className="h-5 w-5" />
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="relative py-32 px-4">
        <GlowingOrb className="w-[500px] h-[500px] bg-amber-500/10 right-0 top-0" delay={3} />
        
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full mb-6">
              <Users className="h-4 w-4 text-amber-400" />
              <span className="text-sm text-amber-300 font-medium">Trusted by Traders</span>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-4xl md:text-5xl font-bold text-white mb-6">
              Loved by <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">Thousands</span>
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid md:grid-cols-3 gap-6"
          >
            <TestimonialCard
              quote="SolTrader completely changed how I approach crypto trading. Setting up automated rules is now as easy as having a conversation."
              author="Alex Chen"
              role="DeFi Trader"
              avatar="A"
            />
            <TestimonialCard
              quote="The AI understands exactly what I want. I've set up complex trading strategies without writing a single line of code."
              author="Sarah Miller"
              role="Portfolio Manager"
              avatar="S"
            />
            <TestimonialCard
              quote="24/7 automation with natural language commands. This is what the future of trading looks like. Highly recommended!"
              author="Michael Lee"
              role="Crypto Enthusiast"
              avatar="M"
            />
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-32 px-4">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/30 to-purple-500/30 rounded-3xl blur-3xl" />
            <div className="relative bg-gradient-to-br from-gray-900/90 to-gray-800/90 backdrop-blur-xl border border-gray-700/50 rounded-3xl p-12 md:p-16 text-center overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="absolute -right-20 -bottom-20 w-64 h-64 border border-gray-700/30 rounded-full"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                className="absolute -right-10 -bottom-10 w-48 h-48 border border-indigo-500/20 rounded-full"
              />
              
              <motion.div
                initial={{ scale: 0 }}
                whileInView={{ scale: 1 }}
                viewport={{ once: true }}
                transition={{ type: "spring", delay: 0.2 }}
                className="inline-flex p-4 bg-indigo-500/20 rounded-2xl mb-6"
              >
                <Zap className="h-8 w-8 text-indigo-400" />
              </motion.div>
              
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                Ready to Transform Your Trading?
              </h2>
              <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
                Join thousands of traders who've already discovered the power of AI-assisted trading on Solana.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link 
                  to="/chat"
                  className="group relative px-10 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl text-white font-semibold text-lg overflow-hidden shadow-2xl shadow-indigo-500/30"
                >
                  <motion.div
                    className="absolute inset-0 bg-white/20"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: "100%" }}
                    transition={{ duration: 0.5 }}
                  />
                  <span className="relative flex items-center gap-3">
                    Get Started Free
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-2 transition-transform" />
                  </span>
                </Link>
                <Link 
                  to="/dashboard"
                  className="px-10 py-4 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700/50 rounded-2xl text-white font-semibold text-lg transition-colors"
                >
                  Explore Dashboard
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-16 px-4 border-t border-gray-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="md:col-span-2">
              <Link to="/" className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-600/20 rounded-xl border border-indigo-500/20">
                  <Zap className="h-6 w-6 text-indigo-400" />
                </div>
                <span className="text-xl font-bold text-white">
                  Sol<span className="text-indigo-400">Trader</span>
                </span>
              </Link>
              <p className="text-gray-400 mb-6 max-w-sm">
                The most intuitive way to create automated trading strategies on Solana. Powered by AI, secured by blockchain.
              </p>
              <div className="flex items-center gap-4">
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84"/></svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/></svg>
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>
                </a>
              </div>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Product</h4>
              <ul className="space-y-3">
                <li><a href="#features" className="text-gray-400 hover:text-white transition-colors text-sm">Features</a></li>
                <li><Link to="/dashboard" className="text-gray-400 hover:text-white transition-colors text-sm">Dashboard</Link></li>
                <li><Link to="/chat" className="text-gray-400 hover:text-white transition-colors text-sm">AI Chat</Link></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Resources</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">Documentation</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">API Reference</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">Support</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">Blog</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-gray-800/50 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-sm">© 2026 SolTrader. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-gray-500 hover:text-gray-400 text-sm">Privacy Policy</a>
              <a href="#" className="text-gray-500 hover:text-gray-400 text-sm">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
