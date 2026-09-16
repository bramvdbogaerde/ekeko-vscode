package com.example;

import java.util.List;
import java.util.ArrayList;

public class Sample {

    private int counter;

    public Sample(int start) {
        this.counter = start;
    }

    public int increment(int amount) {
        this.counter = this.counter + amount;
        return this.counter;
    }

    public List<String> names() {
        List<String> result = new ArrayList<String>();
        result.add("a");
        result.add("b");
        return result;
    }
}
