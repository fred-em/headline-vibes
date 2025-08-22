#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import Sentiment from 'sentiment';
import * as chrono from 'chrono-node';
import { createServer } from 'node:http';
import { NewsApiClient } from './services/newsapi.js';
import { PREFERRED_SOURCE_IDS } from './constants/sources.js';

const NEWS_API_KEY = process.env.NEWS_API_KEY;
if (!NEWS_API_KEY) {
  throw new Error('NEWS_API_KEY environment variable is required');
}

interface Article {
  title: string;
  publishedAt: string;
  source: {
    id: string;
    name: string;
  };
}

interface NewsAPIResponse {
  articles: Article[];
  totalResults: number;
}

// US-focused news sources with diverse political perspectives
const PREFERRED_SOURCES = [
  // Center/Mainstream Sources
  'associated-press',
  'reuters',
  'bloomberg',
  'usa-today',
  'the-wall-street-journal',
  'marketwatch',
  
  // Center-Left Sources
  'the-washington-post',
  'cnn',
  'nbc-news',
  'abc-news',
  'cbs-news',
  'time',
  'business-insider',
  'politico',
  
  // Center-Right Sources
  'fox-news',
  'fox-business',
  'the-hill',
  'national-review',
  'washington-examiner',
  
  // Progressive Sources
  'vice-news',
  'huffpost',
  'vox',
  'the-atlantic',
  'mother-jones',
  
  // Conservative Sources
  'newsmax',
  'washington-times',
  'breitbart-news',
  'the-american-conservative',
  
  // Business/Economic Focus
  'fortune',
  'cnbc'
].join(',');

interface SentimentResult {
  score: number;
  comparative: number;
}

// Headline relevance filtering
const INVESTOR_RELEVANCE = {
  // Terms that indicate investor relevance (with weights)
  inclusion: {
    // Economic indicators and market terms
    'gdp': 2,
    'inflation': 2,
    'interest rate': 2,
    'fed': 2,
    'federal reserve': 2,
    'treasury': 2,
    'bond': 2,
    'yield': 2,
    'market': 1,
    'index': 1,
    'dow': 2,
    'nasdaq': 2,
    's&p': 2,
    'stock': 1,
    
    // Corporate finance and business
    'earnings': 2,
    'revenue': 2,
    'profit': 2,
    'loss': 2,
    'merger': 2,
    'acquisition': 2,
    'ipo': 2,
    'investment': 1,
    'investor': 1,
    'dividend': 2,
    'valuation': 2,
    'shares': 1,
    'stake': 1,
    
    // Real estate specific
    'real estate': 2,
    'property': 1,
    'commercial': 1,
    'retail space': 2,
    'office': 1,
    'lease': 1,
    'tenant': 1,
    'development': 1,
    'construction': 1,
    
    // Economic conditions
    'recession': 2,
    'growth': 1,
    'economy': 1,
    'economic': 1,
    'unemployment': 2,
    'jobs': 1,
    'labor market': 2,
    'consumer spending': 2,
    'retail sales': 2,
    
    // Regulatory and policy
    'sec': 2,
    'regulation': 2,
    'policy': 1,
    'tax': 1,
    'legislation': 1,
    'reform': 1,
    'compliance': 1
  },
  
  // Terms that indicate lifestyle/non-investor content
  exclusion: [
    'recipe',
    'cooking',
    'food',
    'restaurant',
    'diet',
    'fitness',
    'exercise',
    'workout',
    'celebrity',
    'actor',
    'actress',
    'movie',
    'film',
    'tv show',
    'television',
    'entertainment',
    'music',
    'song',
    'album',
    'concert',
    'sports',
    'game',
    'match',
    'player',
    'team',
    'score',
    'lifestyle',
    'fashion',
    'beauty',
    'travel',
    'vacation',
    'holiday',
    'beach',
    'weather',
    'pet',
    'animal',
    'garden',
    'home decor',
    'dating',
    'relationship',
    'wedding',
    'viral',
    'social media',
    'influencer',
    'tiktok',
    'instagram',
    'youtube'
  ]
};

// Investor sentiment lexicon with weighted terms
const INVESTOR_LEXICON = {
  // Strong positive signals (+2)
  'bull market': 2,
  'bullish': 2,
  'record high': 2,
  'outperform': 2,
  'breakthrough': 2,
  'innovation': 2,
  'growth': 2,
  'expansion': 2,
  'rally': 2,
  'surge': 2,
  'record profit': 2,
  'beat expectations': 2,
  'strong demand': 2,
  'market leader': 2,
  'competitive advantage': 2,

  // Moderate positive signals (+1)
  'investment': 1,
  'dividend': 1,
  'profit': 1,
  'earnings': 1,
  'partnership': 1,
  'acquisition': 1,
  'opportunity': 1,
  'recovery': 1,
  'stability': 1,
  'stable': 1,
  'guidance': 1,
  'momentum': 1,

  // Strong negative signals (-2)
  'bear market': -2,
  'bearish': -2,
  'crash': -2,
  'recession': -2,
  'bankruptcy': -2,
  'default': -2,
  'crisis': -2,
  'collapse': -2,
  'investigation': -2,
  'fraud': -2,
  'lawsuit': -2,
  'downgrade': -2,
  'miss expectations': -2,
  'weak demand': -2,
  'market correction': -2,

  // Moderate negative signals (-1)
  'volatility': -1,
  'volatile': -1,
  'uncertainty': -1,
  'uncertain': -1,
  'risk': -1,
  'concern': -1,
  'warning': -1,
  'caution': -1,
  'slowdown': -1,
  'decline': -1,
  'loss': -1,
  'debt': -1,
  'regulatory': -1,
  'inflation': -1
};

interface DualSentiment {
  general: number;
  investor: number;
}

// Source categorization by political leaning
const SOURCE_CATEGORIZATION = {
  'left': [
    'the-washington-post', 'cnn', 'nbc-news', 'abc-news', 'cbs-news', 'time', 
    'business-insider', 'politico', 'vice-news', 'huffpost', 'vox', 
    'the-atlantic', 'mother-jones'
  ],
  'center': [
    'associated-press', 'reuters', 'bloomberg', 'usa-today', 
    'the-wall-street-journal', 'marketwatch', 'fortune', 'cnbc'
  ],
  'right': [
    'fox-news', 'fox-business', 'the-hill', 'national-review', 
    'washington-examiner', 'newsmax', 'washington-times', 
    'breitbart-news', 'the-american-conservative'
  ]
} as const;

class HeadlineSentimentServer {
  private server: Server;
  private sentiment: Sentiment;
  private axiosInstance: ReturnType<typeof axios.create>;

  constructor() {
    this.server = new Server(
      {
        name: 'headline-vibes',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.sentiment = new Sentiment();
    this.axiosInstance = axios.create({
      baseURL: 'https://newsapi.org/v2',
      headers: {
        'X-Api-Key': NEWS_API_KEY,
      },
    });

    this.setupToolHandlers();
    
    // Error handling
    this.server.onerror = (error: Error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private normalizeScore(rawScore: number, range: { min: number; max: number } = { min: -5, max: 5 }): number {
    // Normalize any score to a 0-10 scale
    const normalized = ((rawScore - range.min) / (range.max - range.min)) * 10;
    return Math.max(0, Math.min(10, normalized));
  }

  private isHeadlineRelevant(headline: string): { relevant: boolean; score: number } {
    const lowercaseHeadline = headline.toLowerCase();
    let relevanceScore = 0;
    let hasExclusionTerm = false;

    // Check for exclusion terms first
    for (const term of INVESTOR_RELEVANCE.exclusion) {
      if (lowercaseHeadline.includes(term)) {
        hasExclusionTerm = true;
        break;
      }
    }

    // If no exclusion terms, check for inclusion terms
    if (!hasExclusionTerm) {
      for (const [term, weight] of Object.entries(INVESTOR_RELEVANCE.inclusion)) {
        if (lowercaseHeadline.includes(term)) {
          relevanceScore += weight;
        }
      }
    }

    // Headline is relevant if it has no exclusion terms and at least one inclusion term
    return {
      relevant: !hasExclusionTerm && relevanceScore > 0,
      score: relevanceScore
    };
  }

  private calculateInvestorSentiment(headline: string): number {
    let score = 0;
    const lowercaseHeadline = headline.toLowerCase();
    
    // Check for each term in the lexicon
    Object.entries(INVESTOR_LEXICON).forEach(([term, weight]) => {
      if (lowercaseHeadline.includes(term)) {
        score += weight;
      }
    });
    
    return score;
  }

  private getInvestorSentimentSynopsis(score: number, headlines: string[]): string {
    // Calculate investor-specific terms found
    const termFrequency: { [key: string]: number } = {};
    headlines.forEach(headline => {
      const lowercaseHeadline = headline.toLowerCase();
      Object.keys(INVESTOR_LEXICON).forEach(term => {
        if (lowercaseHeadline.includes(term)) {
          termFrequency[term] = (termFrequency[term] || 0) + 1;
        }
      });
    });

    // Sort terms by frequency
    const topTerms = Object.entries(termFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([term, count]) => `${term} (${count}x)`);

    let investorImpact = "";
    if (score < 3) {
      investorImpact = "Current news cycle likely to discourage new investment interest. Headlines suggest significant market challenges or uncertainties that may deter potential investors.";
    } else if (score < 4.5) {
      investorImpact = "Mixed signals for investor interest. While there are some positive indicators, cautionary elements in the news may create hesitation among potential investors.";
    } else if (score < 5.5) {
      investorImpact = "Neutral investment climate. News coverage balanced between opportunities and challenges, likely maintaining steady investor interest levels.";
    } else if (score < 7) {
      investorImpact = "Favorable conditions for investor interest. Positive market indicators and opportunities highlighted in coverage may attract new qualified investors.";
    } else {
      investorImpact = "Highly conducive to new investment interest. Strong positive signals and market opportunities prominently featured, likely to drive increased qualified sign-ups.";
    }

    return `Investor Sentiment Score: ${score.toFixed(2)} out of 10\n\n${investorImpact}\n\nKey Investment Terms: ${topTerms.join(', ')}`;
  }

  private getSentimentSynopsis(normalizedScore: number, headlines: string[]): string {
    // Categorize headlines by sentiment impact
    const sentiments = headlines.map(headline => ({
      text: headline,
      score: this.sentiment.analyze(headline).comparative
    }));

    const strongPositive = sentiments.filter(s => s.score > 0.5);
    const moderatePositive = sentiments.filter(s => s.score > 0.2 && s.score <= 0.5);
    const strongNegative = sentiments.filter(s => s.score < -0.5);
    const moderateNegative = sentiments.filter(s => s.score < -0.2 && s.score >= -0.5);
    
    let marketImpact = "";
    if (normalizedScore < 3) {
      marketImpact = "Market sentiment appears bearish, with significant negative coverage potentially impacting investor confidence.";
    } else if (normalizedScore < 4.5) {
      marketImpact = "Market sentiment leans cautious, with mixed but predominantly negative signals.";
    } else if (normalizedScore < 5.5) {
      marketImpact = "Market sentiment is balanced, with no strong directional bias in the coverage.";
    } else if (normalizedScore < 7) {
      marketImpact = "Market sentiment leans optimistic, with positive developments outweighing concerns.";
    } else {
      marketImpact = "Market sentiment appears bullish, with strong positive coverage likely boosting investor confidence.";
    }

    // Add context about the distribution of sentiment
    const sentimentDistribution = [
      `${strongPositive.length} headlines (${Math.round((strongPositive.length / headlines.length) * 100)}%) show strongly positive sentiment`,
      `${moderatePositive.length} headlines (${Math.round((moderatePositive.length / headlines.length) * 100)}%) show moderately positive sentiment`,
      `${moderateNegative.length} headlines (${Math.round((moderateNegative.length / headlines.length) * 100)}%) show moderately negative sentiment`,
      `${strongNegative.length} headlines (${Math.round((strongNegative.length / headlines.length) * 100)}%) show strongly negative sentiment`
    ].join(', ');

    return `Sentiment Score: ${normalizedScore.toFixed(2)} out of 10\n\n${marketImpact}\n\nSentiment Distribution: ${sentimentDistribution}`;
  }

  private parseDate(query: string): string {
    const now = new Date();
    const parsedDate = chrono.parseDate(query, now, { forwardDate: false });
    
    if (!parsedDate) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Could not understand the date in your query. Please try something like "yesterday", "last Friday", or a specific date.'
      );
    }

    return parsedDate.toISOString().split('T')[0];
  }

  private getMonthRange(startMonth: string, endMonth: string): { start: string; end: string }[] {
    const months: { start: string; end: string }[] = [];
    const start = new Date(startMonth + '-01');
    const end = new Date(endMonth + '-01');

    let current = new Date(start);
    while (current <= end) {
      const year = current.getFullYear();
      const month = (current.getMonth() + 1).toString().padStart(2, '0');
      const lastDay = new Date(year, current.getMonth() + 1, 0).getDate();
      
      months.push({
        start: `${year}-${month}-01`,
        end: `${year}-${month}-${lastDay}`
      });

      current.setMonth(current.getMonth() + 1);
    }

    return months;
  }

  private async analyzeMonthlyHeadlines(startMonth: string, endMonth: string) {
    const monthRanges = this.getMonthRange(startMonth, endMonth);
    const monthlyResults: { [key: string]: any } = {};

    for (const range of monthRanges) {
      try {
        // Fetch headlines for the entire month (compliant: sources-only via NewsApiClient)
        const client = new NewsApiClient();
        const maxHeadlines = 1000; // Increased for monthly analysis
        const fetched = await client.fetchEverythingRange(range.start, range.end, {
          sources: Array.from(PREFERRED_SOURCE_IDS),
          pageCap: 10
        });
        let articles: Article[] = fetched.map(a => ({
          title: a.title,
          publishedAt: a.publishedAt,
          source: {
            id: a.id ?? (a.sourceName?.toLowerCase().replace(/\s+/g, '-') ?? ''),
            name: a.sourceName
          }
        }));
        if (articles.length > maxHeadlines) {
          articles = articles.slice(0, maxHeadlines);
        }

        // Group headlines by political leaning
        const headlinesByLeaning: { [key: string]: string[] } = {
          left: [],
          center: [],
          right: []
        };

        // Distribute headlines to their respective political categories
        articles.forEach(article => {
          const sourceId = article.source.name?.toLowerCase().replace(/\s+/g, '-');
          if (sourceId) {
            const category = Object.entries(SOURCE_CATEGORIZATION).find(([_, sources]: [string, readonly string[]]) => 
              sources.includes(sourceId)
            )?.[0] as keyof typeof SOURCE_CATEGORIZATION | undefined;
            
            if (category) {
              headlinesByLeaning[category].push(article.title);
            } else {
              headlinesByLeaning.center.push(article.title);
            }
          }
        });

        // Calculate sentiment scores for each political leaning
        const politicalSentiments: { [key: string]: { 
          general: number;
          investor: number;
          headlines: number;
          sample_headlines: string[];
        }} = {};

        for (const [leaning, headlines] of Object.entries(headlinesByLeaning)) {
          if (headlines.length > 0) {
            const sentimentScores = headlines.map(headline => ({
              general: this.sentiment.analyze(headline).comparative,
              investor: this.calculateInvestorSentiment(headline)
            }));

            const generalScore = sentimentScores.reduce((a, b) => a + b.general, 0) / sentimentScores.length;
            const investorScore = sentimentScores.reduce((a, b) => a + b.investor, 0) / sentimentScores.length;

            politicalSentiments[leaning] = {
              general: this.normalizeScore(generalScore),
              investor: this.normalizeScore(investorScore, { min: -4, max: 4 }),
              headlines: headlines.length,
              sample_headlines: headlines.slice(0, 5)
            };
          }
        }

        const monthKey = range.start.substring(0, 7); // YYYY-MM format
        monthlyResults[monthKey] = {
          political_sentiments: politicalSentiments,
          total_headlines: articles.length,
          date_range: range
        };

      } catch (error: any) {
        console.error(`Error processing month ${range.start}: ${error.message}`);
        const monthKey = range.start.substring(0, 7);
        monthlyResults[monthKey] = {
          error: `Failed to process: ${error.message}`,
          date_range: range
        };
      }
    }

    return monthlyResults;
  }

  private async analyzeHeadlinesForDate(date: string) {
    try {
      // Fetch headlines for the date (compliant sources-only via NewsApiClient)
      const client = new NewsApiClient();
      const maxHeadlines = 500; // Increased to accommodate more sources while maintaining good coverage per source
      const fetched = await client.fetchTopHeadlinesByDate(date, {
        sources: Array.from(PREFERRED_SOURCE_IDS),
        pageCap: 5
      });
      let articles: Article[] = fetched.map(a => ({
        title: a.title,
        publishedAt: a.publishedAt,
        source: {
          id: a.id ?? (a.sourceName?.toLowerCase().replace(/\s+/g, '-') ?? ''),
          name: a.sourceName
        }
      }));
      // Limit to maxHeadlines if necessary
      if (articles.length > maxHeadlines) {
        articles = articles.slice(0, maxHeadlines);
      }

      // Track original source distribution before any filtering
      const sourceDistribution: { [key: string]: number } = {};
      articles.forEach(article => {
        const sourceName = article.source.name || 'Unknown';
        sourceDistribution[sourceName] = (sourceDistribution[sourceName] || 0) + 1;
      });

      // Group headlines by source
      const headlinesBySource = articles.reduce((acc: { [key: string]: string[] }, article) => {
        const sourceName = article.source.name || 'Unknown';
        if (!acc[sourceName]) {
          acc[sourceName] = [];
        }
        acc[sourceName].push(article.title);
        return acc;
      }, {});

      // Filter headlines for investor relevance and track filtering stats
      const relevanceResults = new Map<string, { relevant: boolean; score: number; headline: string }>();
      const filteredHeadlinesBySource: { [key: string]: string[] } = {};
      let totalFiltered = 0;
      let totalRelevant = 0;

      Object.entries(headlinesBySource).forEach(([source, headlines]) => {
        headlines.forEach(headline => {
          const result = this.isHeadlineRelevant(headline);
          relevanceResults.set(headline, { ...result, headline });
          
          if (result.relevant) {
            if (!filteredHeadlinesBySource[source]) {
              filteredHeadlinesBySource[source] = [];
            }
            filteredHeadlinesBySource[source].push(headline);
            totalRelevant++;
          }
          totalFiltered++;
        });
      });

      // Get an even distribution of relevant headlines from each source
      const relevantHeadlines: string[] = [];
      const sourcesWithRelevant = Object.keys(filteredHeadlinesBySource);
      const maxPerSource = Math.ceil(maxHeadlines / sourcesWithRelevant.length);

      sourcesWithRelevant.forEach(source => {
        const sourceHeadlines = filteredHeadlinesBySource[source];
        const count = Math.min(sourceHeadlines.length, maxPerSource);
        relevantHeadlines.push(...sourceHeadlines.slice(0, count));
      });

      // Trim to maxHeadlines if we exceeded that
      if (relevantHeadlines.length > maxHeadlines) {
        relevantHeadlines.length = maxHeadlines;
      }
      
      if (relevantHeadlines.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No headlines found for the specified date.',
            },
          ],
        };
      }

      // Calculate sentiment scores for relevant headlines
      const sentimentScores = relevantHeadlines.map(headline => ({
        general: this.sentiment.analyze(headline).comparative,
        investor: this.calculateInvestorSentiment(headline)
      }));

      // Calculate averages
      const generalScore = sentimentScores.reduce((a: number, b: { general: number }) => a + b.general, 0) / sentimentScores.length;
      const investorScore = sentimentScores.reduce((a: number, b: { investor: number }) => a + b.investor, 0) / sentimentScores.length;
      
      // Normalize scores to 0-10 scale
      const normalizedGeneralScore = this.normalizeScore(generalScore);
      // Investor score uses a different range since it's based on term weights
      const normalizedInvestorScore = this.normalizeScore(investorScore, { min: -4, max: 4 });
      
      // Generate both synopses
      const generalSynopsis = this.getSentimentSynopsis(normalizedGeneralScore, relevantHeadlines);
      const investorSynopsis = this.getInvestorSentimentSynopsis(normalizedInvestorScore, relevantHeadlines);

      // Track investor sentiment terms
      const investorTerms: { [key: string]: number } = {};
      relevantHeadlines.forEach(headline => {
        const lowercaseHeadline = headline.toLowerCase();
        Object.entries(INVESTOR_LEXICON).forEach(([term, weight]) => {
          if (lowercaseHeadline.includes(term)) {
            investorTerms[term] = (investorTerms[term] || 0) + 1;
          }
        });
      });

      // Filtering statistics
      const filteringStats = {
        total_headlines: totalFiltered,
        relevant_headlines: totalRelevant,
        relevance_rate: `${((totalRelevant / totalFiltered) * 100).toFixed(1)}%`
      };

      // Group headlines by political leaning
      const headlinesByLeaning: { [key: string]: string[] } = {
        left: [],
        center: [],
        right: []
      };

      // Distribute headlines to their respective political categories
      relevantHeadlines.forEach(headline => {
        const source = articles.find(article => article.title === headline)?.source.name;
        if (source) {
          const sourceId = source.toLowerCase().replace(/\s+/g, '-');
          const category = Object.entries(SOURCE_CATEGORIZATION).find(([_, sources]: [string, readonly string[]]) => 
            sources.includes(sourceId)
          )?.[0] as keyof typeof SOURCE_CATEGORIZATION | undefined;
          
          if (category) {
            headlinesByLeaning[category].push(headline);
          } else {
            // Default to center for uncategorized sources
            headlinesByLeaning.center.push(headline);
          }
        }
      });

      // Calculate sentiment scores for each political leaning
      const politicalSentiments: { [key: string]: { 
        general: number;
        investor: number;
        headlines: number;
      }} = {};

      for (const [leaning, headlines] of Object.entries(headlinesByLeaning)) {
        if (headlines.length > 0) {
          const sentimentScores = headlines.map(headline => ({
            general: this.sentiment.analyze(headline).comparative,
            investor: this.calculateInvestorSentiment(headline)
          }));

          const generalScore = sentimentScores.reduce((a, b) => a + b.general, 0) / sentimentScores.length;
          const investorScore = sentimentScores.reduce((a, b) => a + b.investor, 0) / sentimentScores.length;

          politicalSentiments[leaning] = {
            general: this.normalizeScore(generalScore),
            investor: this.normalizeScore(investorScore, { min: -4, max: 4 }),
            headlines: headlines.length
          };
        }
      }

      // Calculate distribution of sources by category for tracking
      const categoryDistribution: { [key: string]: number } = {};
      Object.entries(sourceDistribution).forEach(([source, count]) => {
        const sourceId = source.toLowerCase().replace(/\s+/g, '-');
        const category = Object.entries(SOURCE_CATEGORIZATION).find(([_, sources]: [string, readonly string[]]) => 
          sources.includes(sourceId)
        )?.[0] as keyof typeof SOURCE_CATEGORIZATION | 'other' || 'other';
        categoryDistribution[category] = (categoryDistribution[category] || 0) + count;
      });

      // Format the response with sentiment scores by political leaning and additional information
      return {
        political_sentiments: politicalSentiments,
        overall_sentiment: {
          general: {
            score: normalizedGeneralScore.toFixed(2),
            synopsis: generalSynopsis
          },
          investor: {
            score: normalizedInvestorScore.toFixed(2),
            synopsis: investorSynopsis,
            key_terms: investorTerms
          }
        },
        filtering_stats: filteringStats,
        headlines_analyzed: relevantHeadlines.length,
        sources_analyzed: sourcesWithRelevant.length,
        source_distribution: sourceDistribution,
        political_distribution: categoryDistribution,
        sample_headlines_by_leaning: {
          left: headlinesByLeaning.left.slice(0, 5),
          center: headlinesByLeaning.center.slice(0, 5),
          right: headlinesByLeaning.right.slice(0, 5)
        }
      };
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new McpError(
        ErrorCode.InternalError,
        `NewsAPI error: ${message}`
      );
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'analyze_headlines',
          description: 'Analyze sentiment of major news headlines using natural language date input',
          inputSchema: {
            type: 'object',
            properties: {
              input: {
                type: 'string',
                description: 'Date input (e.g., "yesterday", "last Friday", "March 10th", or "2025-02-11")',
              },
            },
            required: ['input'],
          },
        },
        {
          name: 'analyze_monthly_headlines',
          description: 'Analyze sentiment of major news headlines over a range of months',
          inputSchema: {
            type: 'object',
            properties: {
              startMonth: {
                type: 'string',
                description: 'Start month in YYYY-MM format (e.g., "2021-01")',
                pattern: '^\d{4}-(?:0[1-9]|1[0-2])$'
              },
              endMonth: {
                type: 'string',
                description: 'End month in YYYY-MM format (e.g., "2025-02")',
                pattern: '^\d{4}-(?:0[1-9]|1[0-2])$'
              }
            },
            required: ['startMonth', 'endMonth'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      switch (request.params.name) {
        case 'analyze_headlines': {
          const { input } = request.params.arguments as { input: string };
          if (!input) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Please provide a date input (e.g., "yesterday", "last Friday")'
            );
          }

          // First try to parse as exact date format
          let date: string;
          if (input.match(/^\d{4}-\d{2}-\d{2}$/)) {
            date = input;
          } else {
            // If not an exact date format, use NLP parsing
            date = this.parseDate(input);
          }

          const result = await this.analyzeHeadlinesForDate(date);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'analyze_monthly_headlines': {
          const { startMonth, endMonth } = request.params.arguments as { 
            startMonth: string; 
            endMonth: string 
          };

          if (!startMonth.match(/^\d{4}-(?:0[1-9]|1[0-2])$/) || 
              !endMonth.match(/^\d{4}-(?:0[1-9]|1[0-2])$/)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Please provide months in YYYY-MM format (e.g., "2021-01")'
            );
          }

          const result = await this.analyzeMonthlyHeadlines(startMonth, endMonth);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  async run() {
    try {
      const transportName = process.env.TRANSPORT || 'stdio';
      if (transportName === 'http') {
        const port = Number(process.env.PORT || 3000);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined
        });
        await this.server.connect(transport);

        const httpServer = createServer((req, res) => {
          transport.handleRequest(req as any, res).catch(err => {
            console.error('[HTTP] handleRequest error', err);
            try {
              res.statusCode = 500;
              res.end('Internal Server Error');
            } catch {}
          });
        });

        httpServer.listen(port, '0.0.0.0', () => {
          console.error(`Headline Sentiment MCP server running on HTTP at 0.0.0.0:${port}`);
        });
      } else {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('Headline Sentiment MCP server running on stdio');
      }
    } catch (error: any) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

const server = new HeadlineSentimentServer();
server.run().catch(error => {
  console.error('Critical server error:', error);
  process.exit(1);
});
