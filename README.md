# Soaking in ClickHouse

The world's moving fast; When you're in the middle of an interview, and you suddenly hear "ClickHouse" mentioned and have nothing to say about it, because when you've seen the name on the website, you assumed it's a new social media app.

No, ClickhHouse is in fact a database of some sort.
From the little I read, it's supposed to speed-up queries from other datasources, including other databases, or plaintext (CSV, JSON)

Let's play with it a little, to see what's up.

## Data

I have recently done some research into earthquakes and collected a bunch of related data; Most of this data is in CSV format, so it might be interesting to do a comparison:

1. Query plain CSV
2. Load into, and query sqlite
3. ... PostgreSQL
4. ... ClickHouse

As far as I remember, it's only ~500k rows and I'm not sure we'd see a major difference in performance at this level, but I can easily collect more data, if that's needed.

You can get this, and much more data yourself, with a [python script](https://github.com/franzos/earthquakes/blob/master/fetch_usgs.py).

## Kickoff

### Plain CSV

First we'll try the basics; Search files on-disk. Here's what we've got:

```bash
ls -lh ./data/
total 96M
-rw-r--r-- 1 franz users 3.1M Jan 10 11:16 '2020-06-26 00:00:00_2020-07-26 00:00:00.csv'
-rw-r--r-- 1 franz users 2.9M Jan 10 11:16 '2020-07-26 00:00:00_2020-08-25 00:00:00.csv'
-rw-r--r-- 1 franz users 2.5M Jan 10 11:16 '2020-08-25 00:00:00_2020-09-24 00:00:00.csv'
-rw-r--r-- 1 franz users 2.7M Jan 10 11:16 '2020-09-24 00:00:00_2020-10-24 00:00:00.csv'
-rw-r--r-- 1 franz users 2.5M Jan 10 11:16 '2020-10-24 00:00:00_2020-11-23 00:00:00.csv'
-rw-r--r-- 1 franz users 2.6M Jan 10 11:16 '2020-11-23 00:00:00_2020-12-23 00:00:00.csv'
...
```

That's 43 files, each with approx. 12k records each.

Let's spawn a virtual environment, and run the script I wrote fo this purpose; We'll simply loop over the files, and filter records with magnitude between 1 and 2 on the richter scale.

```bash
$ guix shell node pnpm
$ pnpm install
$ pnpm run build; node dist/test-csv.js

> clickhouse@1.0.0 build /home/franz/playground/clickhouse
> tsc

Total: 225846
Done in 8.725 seconds.
```

Of course I ran this a bunch of time:

- `8.725s`
- `9.292s`
- `9.375s`

There you go; Takes about 9s to search these records. That being said, we could tweak this a lot; The first thing that comes to mind, is to load each file in parralel; If we assume approx. ~0.2s per file, we can probably cut this down to less than a second, without DB.

### SQLite

This database is really suited for the job; It's quick, doesn't require any setup, and will probably blow our file-based approach away.

On first run, this will create and populate the database. For our half a million records, this takes about 17.28 seconds; Approx. 2x as long, as simply searching the files.

```bash
$ pnpm run build; node dist/test-sqlite.js
Creating table earthquakes
- 17742 records: ./data/2020-06-26 00:00:00_2020-07-26 00:00:00.csv
- 16427 records: ./data/2020-07-26 00:00:00_2020-08-25 00:00:00.csv
- 13859 records: ./data/2020-08-25 00:00:00_2020-09-24 00:00:00.csv
- 15272 records: ./data/2020-09-24 00:00:00_2020-10-24 00:00:00.csv
...
Populate took 17.282 seconds.
Search took 0.002 seconds.
Total: 225846
Count took 0.114 seconds.
```

We do two things:
- Search; which selects 10 records, based on our criteria
- Count: Which counts the number of records, based on our criteria

On subsequent runs, it will simply query the database.

```bash
$ pnpm run build; node dist/test-sqlite.js 

> clickhouse@1.0.0 build /home/franz/playground/clickhouse
> tsc

Table earthquakes already exists
Search took 0 seconds.
Total: 225846
Count took 0.082 seconds.
```

You can already see, that the results are clear.

- If you just need to query the data once, the file-based approach is 2x faster
- If you need to query the data repeatedly, the database is 125x+ faster

At this point it also becomes obvious, that we might needs loads more data or we'll see little difference between ClickHouse and SQLite. Of course we can also optimize SQLite more - for ex., add indexes, etc.

### PostgreSQL

Coming soon.

### ClickHouse

Getting ClickHouse up and running was easy, but the client was a bit of a hassle: Docs are sparse and the insert is very picky, where sqlite doesn't care.

Same as SQLite, this will create and populate the database on first run. For our half a million records, this takes about 13.2 seconds; That's a good chunk faster than SQLite, but still slower than the file-based approach.

That being said, that's probably because:

1. My approach is hardly optimal
  - Could be streaming from the file, instead of loading it into memory
  - Could be loading each file in parralel
  - Don't know their client well
2. I'm talking to the DB via http

I wrote a docker-compose file to ready the ClickHouse server:

```bash
$ docker-compose up
```

and now the script:

```bash
$ pnpm run build; node dist/test-clickhouse.js

> clickhouse@1.0.0 build /home/franz/playground/clickhouse
> tsc

Populating table earthquakes
- 17742 records: ./data/2020-06-26 00:00:00_2020-07-26 00:00:00.csv
- 16427 records: ./data/2020-07-26 00:00:00_2020-08-25 00:00:00.csv
- 13859 records: ./data/2020-08-25 00:00:00_2020-09-24 00:00:00.csv
- 15272 records: ./data/2020-09-24 00:00:00_2020-10-24 00:00:00.csv
...
Populate took 13.287 seconds.
Search took 0.01 seconds.
Total: 225846
Count took 0.008 seconds.
```

The count is 10x faster than SQLite.

```bash
Search took 0.011 seconds.
Total: 225846
Count took 0.006 seconds.

Search took 0.014 seconds.
Total: 225846
Count took 0.011 seconds.

Search took 0.008 seconds.
Total: 225846
Count took 0.02 seconds.
```

## Conclusion

TODO:

- PostgreSQL
- More data
- More ClickHouse