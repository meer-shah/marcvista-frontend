import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, User, ArrowRight, TrendingUp, BookOpen, Target } from "lucide-react";
import { PageHeader } from "@/components/common";
const BlogSectionPage = () => {
  const featuredPosts = [
    {
      id: 1,
      title: "Advanced Risk Management Strategies for Crypto Trading",
      excerpt: "Learn how to protect your capital and maximize profits with proven risk management techniques used by professional traders.",
      author: "Marcvista Team",
      date: "July 5, 2025",
      category: "Risk Management",
      readTime: "8 min read",
      image: "/api/placeholder/400/200",
      featured: true
    },
    {
      id: 2,
      title: "Technical Analysis Masterclass: Reading Market Patterns",
      excerpt: "Discover the secrets of technical analysis and how to identify profitable trading opportunities in volatile markets.",
      author: "Alex Thompson",
      date: "July 4, 2025",
      category: "Technical Analysis",
      readTime: "12 min read",
      image: "/api/placeholder/400/200",
      featured: true
    }
  ];

  const recentPosts = [
    {
      id: 3,
      title: "DeFi Trading: Opportunities and Risks in 2025",
      excerpt: "Exploring the rapidly evolving DeFi landscape and how to navigate its opportunities safely.",
      author: "Sarah Chen",
      date: "July 3, 2025",
      category: "DeFi",
      readTime: "6 min read"
    },
    {
      id: 4,
      title: "Psychology of Trading: Mastering Your Emotions",
      excerpt: "Understanding the psychological aspects of trading and how to maintain discipline during market volatility.",
      author: "Dr. Michael Roberts",
      date: "July 2, 2025",
      category: "Psychology",
      readTime: "10 min read"
    },
    {
      id: 5,
      title: "Automated Trading Bots: Setup and Optimization Guide",
      excerpt: "Complete guide to setting up and optimizing trading bots for consistent performance.",
      author: "Tech Team",
      date: "July 1, 2025",
      category: "Automation",
      readTime: "15 min read"
    },
    {
      id: 6,
      title: "Market Analysis: Bitcoin's Path to 100K",
      excerpt: "Comprehensive analysis of Bitcoin's price movements and potential catalysts for the next bull run.",
      author: "Market Analysts",
      date: "June 30, 2025",
      category: "Market Analysis",
      readTime: "7 min read"
    },
    {
      id: 7,
      title: "Crypto Regulations: What Traders Need to Know",
      excerpt: "Latest regulatory updates and their impact on cryptocurrency trading strategies.",
      author: "Legal Team",
      date: "June 29, 2025",
      category: "Regulations",
      readTime: "9 min read"
    },
    {
      id: 8,
      title: "NFT Market Trends: Trading Digital Assets",
      excerpt: "Understanding the NFT market dynamics and profitable trading strategies.",
      author: "NFT Experts",
      date: "June 28, 2025",
      category: "NFT",
      readTime: "11 min read"
    }
  ];

  const categories = [
    { name: "Risk Management", count: 12, icon: Target },
    { name: "Technical Analysis", count: 18, icon: TrendingUp },
    { name: "Market Analysis", count: 15, icon: BookOpen },
    { name: "Psychology", count: 8, icon: User },
    { name: "DeFi", count: 10, icon: Target },
    { name: "Automation", count: 6, icon: Target }
  ];

  const popularPosts = [
    { title: "Risk Management 101", views: "2.5k" },
    { title: "Crypto Tax Guide 2025", views: "1.8k" },
    { title: "Trading Psychology", views: "1.6k" },
    { title: "DeFi Yield Farming", views: "1.4k" },
    { title: "Technical Indicators", views: "1.2k" }
  ];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Trading Blog & Insights"
        subtitle="Stay updated with the latest trading strategies and market analysis"
        rightContent={
          <Button className="w-full sm:w-auto">
            View All Posts
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        }
      />

      {/* Featured Posts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {featuredPosts.map((post) => (
          <Card key={post.id} className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 hover:bg-[#1B1B1B]/90 transition-all cursor-pointer">
            <div className="h-32 sm:h-[clamp(192px,30vh,250px)] bg-gradient-to-r from-primary/20 to-primary/5 rounded-t-lg flex items-center justify-center">
              <div className="text-center">
                <BookOpen className="w-8 sm:w-12 h-8 sm:h-12 mx-auto mb-2 text-primary" />
                <Badge variant="secondary" className="text-xs">Featured</Badge>
              </div>
            </div>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="text-xs">{post.category}</Badge>
                <span className="text-xs sm:text-sm text-muted-foreground">{post.readTime}</span>
              </div>
              <h3 className="text-base sm:text-lg font-semibold mb-2 line-clamp-2">{post.title}</h3>
              <p className="text-muted-foreground text-xs sm:text-sm mb-4 line-clamp-3">{post.excerpt}</p>
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="w-3 sm:w-4 h-3 sm:h-4" />
                  <span>{post.author}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-3 sm:w-4 h-3 sm:h-4" />
                  <span>{post.date}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid - Recent Posts + Categories & Popular */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Posts - Takes 8 columns on large screens */}
        <div className="lg:col-span-8">
          <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10 h-full">
            <CardHeader>
              <CardTitle className="text-lg">Recent Posts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 lg:max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent hover:scrollbar-thumb-primary/50 pr-2">
                {recentPosts.map((post) => (
                  <div key={post.id} className="p-3 sm:p-4 rounded-lg bg-background/20 hover:bg-background/30 transition-colors cursor-pointer border border-white/5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs">{post.category}</Badge>
                          <span className="text-xs text-muted-foreground">{post.readTime}</span>
                        </div>
                        <h4 className="font-medium mb-2 line-clamp-2 text-sm sm:text-base">{post.title}</h4>
                        <p className="text-xs sm:text-sm text-muted-foreground mb-3 line-clamp-2">{post.excerpt}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span>{post.author}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>{post.date}</span>
                          </div>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="ml-2 flex-shrink-0">
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Categories & Popular - Takes 4 columns on large screens */}
        <div className="lg:col-span-4 space-y-6">
          {/* Categories */}
          <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
            <CardHeader>
              <CardTitle className="text-lg">Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent hover:scrollbar-thumb-primary/50 pr-2">
                {categories.map((category) => {
                  const IconComponent = category.icon;
                  return (
                    <div key={category.name} className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-background/20 hover:bg-background/30 transition-colors cursor-pointer">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <IconComponent className="w-3 sm:w-4 h-3 sm:h-4 text-primary" />
                        <span className="text-xs sm:text-sm">{category.name}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">{category.count}</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Popular This Week */}
          <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
            <CardHeader>
              <CardTitle className="text-lg">Popular This Week</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent hover:scrollbar-thumb-primary/50 pr-2">
                {popularPosts.map((post, index) => (
                  <div key={index} className="p-2 sm:p-3 rounded-lg bg-background/20 hover:bg-background/30 transition-colors cursor-pointer">
                    <h4 className="text-xs sm:text-sm font-medium mb-1 line-clamp-2">{post.title}</h4>
                    <p className="text-xs text-muted-foreground">{post.views} views</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Newsletter - Full Width */}
      <Card className="bg-[#1B1B1B]/80 backdrop-blur-lg border-white/10">
        <CardHeader className="text-center">
          <CardTitle className="text-lg sm:text-xl">Subscribe to Our Newsletter</CardTitle>
          <p className="text-muted-foreground text-sm sm:text-base">
            Get weekly trading insights and market updates delivered to your inbox.
          </p>
        </CardHeader>
        <CardContent className="max-w-md mx-auto">
          <div className="space-y-2">
            <input 
              type="email" 
              placeholder="Enter your email"
              className="w-full px-3 py-2 bg-background/20 border border-white/10 rounded-md text-sm"
            />
            <Button size="sm" className="w-full">Subscribe</Button>
          </div>
        </CardContent>
      </Card>
        </div>
    </div>
  );
};

export default BlogSectionPage;
