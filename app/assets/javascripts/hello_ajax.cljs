(ns helloajax
  (:require [reagent.core :as reagent :refer [atom]]
            [jayq.core])
  (:require-macros [jayq.macros :refer [let-ajax]]))

(def greeter (atom "you need to make a greeter"))

(defn get-greeter [name]
  (let-ajax [response {:url "/hello_ajax/greet"
                       :method :post
                       :dataType :json
                       :data {:name name}}]
    (reset! greeter (.-greet response))))

(defn name-form []
  (let [name (atom "")]
    (fn []
      [:p "Please enter your name and hit the button: "
       [:input {:type "text"
                :value @name
                :name "name"
                :on-change #(reset! name (-> % .-target .-value))}]
       [:button {:on-click #(get-greeter @name)} "Make Greeter"]])))

(defn main-component []
  [:div [name-form]
   [:h2 @greeter]])


(defn ^:export run []
  (reagent/render-component
    [main-component]
    (.getElementById js/document "hello-ajax-container")))